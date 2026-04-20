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

let memQueue = []; // [{ url, endpoint, items, ts }]
let stats = {
  sent: 0,
  pending: 0,
  failed: 0,
  last_endpoint: "",
  last_error: "",
};
let flushing = false;

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
  const r = await chrome.storage.local.get([QUEUE_KEY, STATS_KEY]);
  if (Array.isArray(r[QUEUE_KEY])) memQueue = r[QUEUE_KEY];
  if (r[STATS_KEY] && typeof r[STATS_KEY] === "object") {
    stats = { ...stats, ...r[STATS_KEY] };
  }
  stats.pending = memQueue.reduce((a, b) => a + (b.items?.length || 0), 0);
}

function enqueue(capture) {
  memQueue.push(capture);
  stats.last_endpoint = capture.endpoint || "";
  persistQueue();
  persistStats();
}

async function postBatch(backendUrl, batch) {
  const url = `${backendUrl.replace(/\/+$/, "")}/api/ingest`;
  const body = JSON.stringify({
    source_url: batch.url || "",
    endpoint: batch.endpoint || "unknown",
    items: batch.items || [],
  });
  const resp = await fetch(url, {
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

    // Tách thành chunk theo BATCH_SIZE items, giữ metadata theo batch gốc khi có thể.
    const toSend = [];
    let acc = null;
    for (const entry of memQueue) {
      if (!acc) {
        acc = {
          url: entry.url,
          endpoint: entry.endpoint,
          items: [...(entry.items || [])],
        };
      } else {
        acc.items.push(...(entry.items || []));
      }
      if (acc.items.length >= BATCH_SIZE) {
        toSend.push(acc);
        acc = null;
      }
    }
    if (acc && acc.items.length) toSend.push(acc);

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

// -------- message handlers --------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || typeof msg !== "object") return sendResponse(null);

      if (msg.type === "pm-capture") {
        const cfg = await getConfig();
        if (!cfg.enabled) return sendResponse({ ok: false, reason: "disabled" });

        enqueue({
          url: msg.url || "",
          endpoint: msg.endpoint || "unknown",
          items: Array.isArray(msg.items) ? msg.items : [],
          ts: msg.ts || Date.now(),
        });

        const pending = memQueue.reduce((a, b) => a + (b.items?.length || 0), 0);
        if (pending >= BATCH_SIZE) flush();
        return sendResponse({ ok: true, pending });
      }

      if (msg.type === "pm-get-stats") {
        return sendResponse({
          ...stats,
          pending: memQueue.reduce((a, b) => a + (b.items?.length || 0), 0),
        });
      }

      if (msg.type === "pm-retry-now") {
        await flush();
        return sendResponse({ ok: true });
      }

      if (msg.type === "pm-clear-queue") {
        memQueue = [];
        stats.failed = 0;
        stats.last_error = "";
        await persistQueue();
        await persistStats();
        return sendResponse({ ok: true });
      }

      if (msg.type === "pm-config-updated") {
        return sendResponse({ ok: true });
      }

      return sendResponse(null);
    } catch (e) {
      return sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // async
});

// -------- periodic flush via alarms (SW safe) --------
chrome.alarms.create("pm-flush", { periodInMinutes: FLUSH_ALARM_PERIOD_MIN });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "pm-flush") flush();
});

// Restore queue + stats khi SW spawn
restoreState().then(() => {
  // Nếu còn pending, thử flush sớm
  if (memQueue.length) flush();
});
