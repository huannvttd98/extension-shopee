// ProductMap background service worker (MV3).
// Gom batch items từ content script → POST về backend.

const DEFAULTS = {
  enabled: true,
  backendUrl: "http://localhost:8000",
};

const BATCH_SIZE = 50;
const FLUSH_ALARM_PERIOD_MIN = 0.5; // MV3 min 30s; trigger size-based flush dominates thực tế
const RETRY_DELAYS = [1000, 2000, 5000, 10000];
const QUEUE_KEY = "pm_queue_v1";
const STATS_KEY = "pm_stats_v1";
const AUTOSCAN_KEY = "pm_autoscan_v1";

const AUTOSCAN_INIT = {
  tabId: null,
  sessionId: null,
  keyword: "",
  maxScrolls: 200,
  closeTabWhenDone: true,
  status: "idle", // idle | running | done | aborted | error
  startedAt: 0,
  finishedAt: 0,
  scrollTicks: 0,
  totalItemsSeen: 0,
  reason: "",
  lastError: "",
};

let memQueue = []; // [{ url, endpoint, items, ts }]
let stats = {
  sent: 0,
  pending: 0,
  failed: 0,
  last_endpoint: "",
  last_error: "",
};
let flushing = false;
let autoscan = { ...AUTOSCAN_INIT };

// -------- helpers --------
async function getConfig() {
  return chrome.storage.sync.get(DEFAULTS);
}

async function persistQueue() {
  await chrome.storage.local.set({ [QUEUE_KEY]: memQueue });
}

async function persistStats() {
  stats.pending = memQueue.reduce((a, b) => a + (b.items?.length || 0), 0);
  await chrome.storage.local.set({ [STATS_KEY]: stats });
}

async function restoreState() {
  const r = await chrome.storage.local.get([QUEUE_KEY, STATS_KEY, AUTOSCAN_KEY]);
  if (Array.isArray(r[QUEUE_KEY])) memQueue = r[QUEUE_KEY];
  if (r[STATS_KEY] && typeof r[STATS_KEY] === "object") {
    stats = { ...stats, ...r[STATS_KEY] };
  }
  if (r[AUTOSCAN_KEY] && typeof r[AUTOSCAN_KEY] === "object") {
    autoscan = { ...AUTOSCAN_INIT, ...r[AUTOSCAN_KEY] };
    // Nếu SW restart mà session đang "running", cần verify tab còn tồn tại
    if (autoscan.status === "running" && autoscan.tabId != null) {
      const tab = await chrome.tabs.get(autoscan.tabId).catch(() => null);
      if (!tab) {
        const sessionId = autoscan.sessionId;
        autoscan.status = "aborted";
        autoscan.reason = "tab-gone";
        autoscan.finishedAt = Date.now();
        await persistAutoscan();
        // Chạy không đợi — restoreState cần về sớm để handler khác không bị chặn.
        finalizeSessionOnBackend(sessionId, "aborted", "tab-gone");
      }
    }
  }
  stats.pending = memQueue.reduce((a, b) => a + (b.items?.length || 0), 0);
}

async function persistAutoscan() {
  await chrome.storage.local.set({ [AUTOSCAN_KEY]: autoscan });
}

function enqueue(capture) {
  memQueue.push(capture);
  stats.last_endpoint = capture.endpoint || "";
  persistQueue();
  persistStats();
}

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, "")}${path}`;
}

async function postBatch(backendUrl, batch) {
  const body = JSON.stringify({
    source_url: batch.url || "",
    endpoint: batch.endpoint || "unknown",
    items: batch.items || [],
    session_id: batch.session_id ?? null,
  });
  const resp = await fetch(joinUrl(backendUrl, "/api/ingest"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} ${txt.slice(0, 200)}`);
  }
  return resp.json().catch(() => ({}));
}

async function createScanSessionOnBackend({ keyword, maxScrolls, tabUrl }) {
  const cfg = await getConfig();
  const resp = await fetch(joinUrl(cfg.backendUrl, "/api/scan-sessions"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      keyword,
      source: "autoscan",
      max_scrolls: maxScrolls,
      tab_url: tabUrl,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} ${txt.slice(0, 200)}`);
  }
  return resp.json();
}

async function patchScanSessionOnBackend(sessionId, patch) {
  const cfg = await getConfig();
  const resp = await fetch(
    joinUrl(cfg.backendUrl, `/api/scan-sessions/${sessionId}`),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }
  );
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} ${txt.slice(0, 200)}`);
  }
  return resp.json();
}

async function sendWithRetry(backendUrl, batch) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const r = await postBatch(backendUrl, batch);
      return r;
    } catch (e) {
      lastErr = e;
      if (attempt < RETRY_DELAYS.length) {
        await new Promise((res) => setTimeout(res, RETRY_DELAYS[attempt]));
      }
    }
  }
  throw lastErr;
}

async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const cfg = await getConfig();
    if (!cfg.enabled) return;
    if (memQueue.length === 0) return;

    // Mỗi entry = 1 POST (không gộp cross-entry vì session_id có thể khác nhau).
    // Backend chấp nhận batch tối đa INGEST_MAX_BATCH (~500); 1 response Shopee ~60 items nên an toàn.
    const toSend = memQueue;
    memQueue = [];
    await persistQueue();

    for (const batch of toSend) {
      try {
        await sendWithRetry(cfg.backendUrl, batch);
        stats.sent += batch.items.length;
        stats.last_error = "";
      } catch (e) {
        // Gửi thất bại → đẩy lại vào queue cuối
        memQueue.push(batch);
        stats.failed += batch.items.length;
        stats.last_error = String(e.message || e).slice(0, 300);
      }
    }
    await persistQueue();
    await persistStats();
  } finally {
    flushing = false;
  }
}

// -------- autoscan --------
function buildAutoscanUrl(keyword, maxScrolls) {
  const u = new URL("https://shopee.vn/search");
  u.searchParams.set("keyword", keyword);
  u.searchParams.set("pm_autoscan", "1");
  u.searchParams.set("pm_max", String(maxScrolls));
  return u.toString();
}

async function finalizeSessionOnBackend(sessionId, status, reason) {
  if (!sessionId) return;
  await patchScanSessionOnBackend(sessionId, {
    status,
    reason: String(reason || "").slice(0, 64),
    scroll_ticks: autoscan.scrollTicks,
    items_seen: autoscan.totalItemsSeen,
    finished: true,
  }).catch((e) => {
    stats.last_error = String(e?.message || e).slice(0, 300);
  });
}

async function startAutoscan({ keyword, maxScrolls, closeTabWhenDone }) {
  if (autoscan.status === "running") {
    return { ok: false, error: "đang có phiên quét khác" };
  }
  const kw = String(keyword || "").trim();
  if (!kw) return { ok: false, error: "thiếu từ khóa" };

  const mx = Math.min(2000, Math.max(10, Number.parseInt(maxScrolls, 10) || 200));
  const url = buildAutoscanUrl(kw, mx);

  // 1. Tạo session trên backend TRƯỚC khi mở tab — để có session_id tag vào từng ingest batch.
  let created;
  try {
    created = await createScanSessionOnBackend({ keyword: kw, maxScrolls: mx, tabUrl: url });
  } catch (e) {
    autoscan = {
      ...AUTOSCAN_INIT,
      status: "error",
      lastError: String(e?.message || e),
    };
    await persistAutoscan();
    return { ok: false, error: `tạo session thất bại: ${autoscan.lastError}` };
  }

  // 2. Mở tab quét.
  const tab = await chrome.tabs.create({ url, active: true }).catch((e) => {
    autoscan.lastError = String(e?.message || e);
    return null;
  });
  if (!tab) {
    // Session đã tạo trên backend → mark error ngay, không mở tab thì không ingest gì.
    await finalizeSessionOnBackend(created.id, "error", "open-tab-failed");
    autoscan = {
      ...AUTOSCAN_INIT,
      status: "error",
      lastError: autoscan.lastError || "không mở được tab",
    };
    await persistAutoscan();
    return { ok: false, error: autoscan.lastError };
  }

  autoscan = {
    ...AUTOSCAN_INIT,
    tabId: tab.id,
    sessionId: created.id,
    keyword: kw,
    maxScrolls: mx,
    closeTabWhenDone: !!closeTabWhenDone,
    status: "running",
    startedAt: Date.now(),
  };
  await persistAutoscan();
  return { ok: true, session_id: created.id };
}

async function stopAutoscan() {
  if (autoscan.status !== "running") {
    return { ok: false, error: "không có phiên đang chạy" };
  }
  const tabId = autoscan.tabId;
  const sessionId = autoscan.sessionId;
  autoscan.status = "aborted";
  autoscan.reason = "user-stop";
  autoscan.finishedAt = Date.now();
  await persistAutoscan();
  if (tabId != null) {
    // Báo content script dừng trước để nó notify, rồi đóng tab.
    chrome.tabs
      .sendMessage(tabId, { type: "pm-autoscan-abort" })
      .catch(() => {});
    chrome.tabs.remove(tabId).catch(() => {});
  }
  // Flush queue còn lại rồi mới finalize session trên backend
  // (để products_upserted counter chính xác).
  await flush().catch(() => {});
  await finalizeSessionOnBackend(sessionId, "aborted", "user-stop");
  return { ok: true };
}

async function onAutoscanProgress(tabId, msg) {
  if (autoscan.tabId !== tabId || autoscan.status !== "running") return;
  if (typeof msg.scrollTicks === "number") autoscan.scrollTicks = msg.scrollTicks;
  if (typeof msg.totalItemsSeen === "number") {
    autoscan.totalItemsSeen = msg.totalItemsSeen;
  }
  await persistAutoscan();
}

async function onAutoscanDone(tabId, msg) {
  if (autoscan.tabId !== tabId) return;
  if (autoscan.status !== "running") return;
  autoscan.status = "done";
  autoscan.reason = msg.reason || "";
  autoscan.finishedAt = Date.now();
  if (typeof msg.scrollTicks === "number") autoscan.scrollTicks = msg.scrollTicks;
  if (typeof msg.totalItemsSeen === "number") {
    autoscan.totalItemsSeen = msg.totalItemsSeen;
  }
  await persistAutoscan();

  // Flush queue nốt để items của lần scroll cuối kịp ingest với session_id đúng.
  await flush().catch((e) => {
    stats.last_error = String(e?.message || e).slice(0, 300);
  });

  // Đồng bộ counters cuối cùng lên backend.
  await finalizeSessionOnBackend(autoscan.sessionId, "done", autoscan.reason);

  if (autoscan.closeTabWhenDone && tabId != null) {
    chrome.tabs.remove(tabId).catch(() => {});
  }
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (autoscan.tabId === tabId && autoscan.status === "running") {
    const sessionId = autoscan.sessionId;
    autoscan.status = "aborted";
    autoscan.reason = "tab-closed";
    autoscan.finishedAt = Date.now();
    await persistAutoscan();
    await flush().catch(() => {});
    await finalizeSessionOnBackend(sessionId, "aborted", "tab-closed");
  }
});

// -------- message handlers --------
async function handleCapture(msg, sender) {
  const cfg = await getConfig();
  if (!cfg.enabled) return { ok: false, reason: "disabled" };

  // Tag session_id khi capture đến từ tab autoscan đang chạy.
  let sessionId = null;
  if (
    autoscan.status === "running" &&
    autoscan.sessionId &&
    sender?.tab?.id === autoscan.tabId
  ) {
    sessionId = autoscan.sessionId;
  }

  enqueue({
    url: msg.url || "",
    endpoint: msg.endpoint || "unknown",
    items: Array.isArray(msg.items) ? msg.items : [],
    ts: msg.ts || Date.now(),
    session_id: sessionId,
  });

  const pending = memQueue.reduce((a, b) => a + (b.items?.length || 0), 0);
  if (pending >= BATCH_SIZE) flush();
  return { ok: true, pending };
}

async function handleGetStats() {
  return {
    ...stats,
    pending: memQueue.reduce((a, b) => a + (b.items?.length || 0), 0),
  };
}

async function handleRetryNow() {
  await flush();
  return { ok: true };
}

async function handleClearQueue() {
  memQueue = [];
  stats.failed = 0;
  stats.last_error = "";
  await persistQueue();
  await persistStats();
  return { ok: true };
}

const HANDLERS = {
  "pm-capture": (msg, sender) => handleCapture(msg, sender),
  "pm-get-stats": () => handleGetStats(),
  "pm-retry-now": () => handleRetryNow(),
  "pm-clear-queue": () => handleClearQueue(),
  "pm-config-updated": () => ({ ok: true }),
  "pm-autoscan-start": (msg) => startAutoscan(msg.payload || {}),
  "pm-autoscan-stop": () => stopAutoscan(),
  "pm-autoscan-get-state": () => ({ ok: true, state: autoscan }),
  "pm-autoscan-progress": async (msg, sender) => {
    await onAutoscanProgress(sender?.tab?.id, msg);
    return { ok: true };
  },
  "pm-autoscan-done": async (msg, sender) => {
    await onAutoscanDone(sender?.tab?.id, msg);
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = msg && typeof msg === "object" ? HANDLERS[msg.type] : null;
  if (!handler) {
    sendResponse(null);
    return false;
  }
  Promise.resolve()
    .then(() => handler(msg, sender))
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true; // async
});

// -------- periodic flush via alarms (SW safe) --------
chrome.alarms.create("pm-flush", { periodInMinutes: FLUSH_ALARM_PERIOD_MIN });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "pm-flush") flush();
});

// Restore queue + stats khi SW spawn.
// Lưu ý: MV3 service worker KHÔNG cho phép top-level await — phải dùng .then().
// NOSONAR — top-level await bị Chrome chặn trong service_worker context.
restoreState().then(() => { // NOSONAR
  if (memQueue.length) flush();
});
