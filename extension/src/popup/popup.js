const $ = (id) => document.getElementById(id);

// -------- tabs --------
function switchTab(name) {
  for (const btn of document.querySelectorAll(".tab")) {
    btn.classList.toggle("active", btn.dataset.tab === name);
  }
  for (const panel of document.querySelectorAll(".tab-panel")) {
    panel.classList.toggle("hidden", panel.id !== `panel-${name}`);
  }
}

for (const btn of document.querySelectorAll(".tab")) {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
    if (btn.dataset.tab === "history") loadHistoryList();
  });
}

// -------- crawler tab --------
async function loadConfig() {
  const cfg = await chrome.storage.sync.get({
    enabled: true,
    backendUrl: "http://localhost:8000",
  });
  $("enabled").checked = cfg.enabled;
  $("backendUrl").value = cfg.backendUrl;
}

async function saveConfig() {
  await chrome.storage.sync.set({
    enabled: $("enabled").checked,
    backendUrl: $("backendUrl").value.trim() || "http://localhost:8000",
  });
  chrome.runtime.sendMessage({ type: "pm-config-updated" });
}

function renderStats(s) {
  $("sent").textContent = s.sent ?? 0;
  $("pending").textContent = s.pending ?? 0;
  $("failed").textContent = s.failed ?? 0;
  $("lastEndpoint").textContent = s.last_endpoint || "—";
  $("lastError").textContent = s.last_error || "—";
}

async function fetchStats() {
  const r = await chrome.runtime.sendMessage({ type: "pm-get-stats" });
  if (r) renderStats(r);
}

$("enabled").addEventListener("change", saveConfig);
$("saveConfig").addEventListener("click", saveConfig);
$("retryNow").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "pm-retry-now" });
  fetchStats();
});
$("clearQueue").addEventListener("click", async () => {
  if (!confirm("Xoá toàn bộ queue pending?")) return;
  await chrome.runtime.sendMessage({ type: "pm-clear-queue" });
  fetchStats();
});

// -------- autoscan tab --------
const AUTOSCAN_DEFAULTS = {
  keyword: "",
  maxScrolls: 200,
  closeTabWhenDone: true,
};

async function loadAutoscanConfig() {
  const cfg = await chrome.storage.sync.get({ autoscan: AUTOSCAN_DEFAULTS });
  const a = { ...AUTOSCAN_DEFAULTS, ...cfg.autoscan };
  $("autoKeyword").value = a.keyword;
  $("autoMax").value = a.maxScrolls;
  $("autoCloseTab").checked = a.closeTabWhenDone;
}

async function saveAutoscanConfig() {
  await chrome.storage.sync.set({
    autoscan: {
      keyword: $("autoKeyword").value.trim(),
      maxScrolls: Number.parseInt($("autoMax").value, 10) || 200,
      closeTabWhenDone: $("autoCloseTab").checked,
    },
  });
}

function renderAutoscan(state) {
  if (!state) return;
  const running = state.status === "running";
  $("autoStatus").textContent = state.status || "idle";
  $("autoTicks").textContent = state.scrollTicks ?? 0;
  $("autoItems").textContent = state.totalItemsSeen ?? 0;
  $("autoKw").textContent = state.keyword || "—";
  $("autoReason").textContent = state.reason || state.lastError || "—";
  $("autoStart").disabled = running;
  $("autoStop").disabled = !running;
}

async function fetchAutoscan() {
  const r = await chrome.runtime.sendMessage({ type: "pm-autoscan-get-state" });
  if (r?.ok) renderAutoscan(r.state);
}

$("autoStart").addEventListener("click", async () => {
  const keyword = $("autoKeyword").value.trim();
  if (!keyword) {
    alert("Nhập từ khóa trước đã.");
    return;
  }
  const maxScrolls = Number.parseInt($("autoMax").value, 10) || 200;
  const closeTabWhenDone = $("autoCloseTab").checked;
  await saveAutoscanConfig();

  const r = await chrome.runtime.sendMessage({
    type: "pm-autoscan-start",
    payload: { keyword, maxScrolls, closeTabWhenDone },
  });
  if (!r?.ok) alert("Không bắt đầu được: " + (r?.error || "unknown"));
  fetchAutoscan();
});

$("autoStop").addEventListener("click", async () => {
  const r = await chrome.runtime.sendMessage({ type: "pm-autoscan-stop" });
  if (!r?.ok) alert("Không dừng được: " + (r?.error || "unknown"));
  fetchAutoscan();
});

// -------- history tab --------
async function getBackendUrl() {
  const cfg = await chrome.storage.sync.get({ backendUrl: "http://localhost:8000" });
  return String(cfg.backendUrl || "").replace(/\/+$/, "");
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { hour12: false });
}

function fmtPrice(n) {
  if (n == null) return "—";
  // Shopee trả giá đã x100000. Phát hiện: nếu quá lớn so với VND thông thường → chia.
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const normalized = v >= 1e6 ? Math.round(v / 1e5) : v;
  return normalized.toLocaleString("vi-VN") + " đ";
}

function el(tag, opts = {}, children = []) {
  const e = document.createElement(tag);
  if (opts.class) e.className = opts.class;
  if (opts.text != null) e.textContent = String(opts.text);
  if (opts.on) for (const [ev, fn] of Object.entries(opts.on)) e.addEventListener(ev, fn);
  for (const c of children) if (c) e.appendChild(c);
  return e;
}

async function loadHistoryList() {
  const base = await getBackendUrl();
  const rows = $("historyRows");
  rows.textContent = "";
  $("historyMeta").textContent = "đang tải…";
  try {
    const r = await fetch(`${base}/api/scan-sessions?limit=30`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    $("historyMeta").textContent = `${data.total} phiên`;
    if (!data.items.length) {
      rows.appendChild(el("div", { class: "muted", text: "Chưa có phiên quét nào." }));
      return;
    }
    for (const s of data.items) rows.appendChild(renderHistoryRow(s));
  } catch (e) {
    $("historyMeta").textContent = `lỗi: ${e.message}`;
  }
}

function renderHistoryRow(s) {
  const kw = el("span", { class: "row-kw", text: s.keyword || "—" });
  const status = el("span", { class: `row-status ${s.status || ""}`, text: s.status || "?" });
  const sub = el("span", {
    class: "row-sub",
    text: `#${s.id} · ${fmtDate(s.started_at)} · items=${s.items_seen} · upserted=${s.products_upserted}`,
  });
  return el(
    "div",
    { class: "history-row", on: { click: () => openHistoryDetail(s.id) } },
    [kw, status, sub]
  );
}

async function openHistoryDetail(sessionId) {
  $("historyList").classList.add("hidden");
  $("historyDetail").classList.remove("hidden");
  const header = $("historyDetailHeader");
  const productsBox = $("historyProducts");
  header.textContent = "đang tải…";
  productsBox.textContent = "";
  $("historyProductsMeta").textContent = "—";

  const base = await getBackendUrl();
  try {
    const [sRes, pRes] = await Promise.all([
      fetch(`${base}/api/scan-sessions/${sessionId}`),
      fetch(`${base}/api/scan-sessions/${sessionId}/products?limit=30`),
    ]);
    if (!sRes.ok) throw new Error(`session HTTP ${sRes.status}`);
    if (!pRes.ok) throw new Error(`products HTTP ${pRes.status}`);
    const s = await sRes.json();
    const p = await pRes.json();
    renderHistoryDetail(header, s);
    $("historyProductsMeta").textContent = `${p.total} SP`;
    productsBox.textContent = "";
    if (!p.items.length) {
      productsBox.appendChild(el("div", { class: "muted", text: "Phiên này chưa ghi nhận SP nào." }));
    } else {
      for (const prod of p.items) productsBox.appendChild(renderHistoryProduct(prod));
    }
  } catch (e) {
    header.textContent = `Lỗi: ${e.message}`;
  }
}

function renderHistoryDetail(container, s) {
  container.textContent = "";
  container.appendChild(el("span", { class: "kw", text: s.keyword || "—" }));
  const rows = [
    ["ID", `#${s.id}`],
    ["Status", `${s.status}${s.reason ? ` (${s.reason})` : ""}`],
    ["Source", s.source || "—"],
    ["Started", fmtDate(s.started_at)],
    ["Finished", fmtDate(s.finished_at)],
    ["Scroll ticks", `${s.scroll_ticks} / ${s.max_scrolls || "?"}`],
    ["Items API", s.items_seen],
    ["Upserted", s.products_upserted],
  ];
  for (const [k, v] of rows) {
    container.appendChild(el("div", { class: "kv" }, [
      el("span", { text: k }),
      el("span", { text: String(v) }),
    ]));
  }
}

function renderHistoryProduct(p) {
  const name = el("span", { class: "p-name", text: p.name || "(no name)" });
  const price = el("span", { class: "p-price", text: fmtPrice(p.price) });
  const meta = el("span", {
    class: "p-meta",
    text: `id=${p.id} · sold=${p.sold ?? 0} · rating=${p.rating_avg ?? "—"}`,
  });
  return el("div", { class: "history-product" }, [name, price, meta]);
}

$("historyRefresh").addEventListener("click", loadHistoryList);
$("historyBack").addEventListener("click", () => {
  $("historyDetail").classList.add("hidden");
  $("historyList").classList.remove("hidden");
});

// -------- init --------
await Promise.all([loadConfig(), loadAutoscanConfig(), fetchStats(), fetchAutoscan()]);
setInterval(() => {
  fetchStats();
  fetchAutoscan();
}, 1500);
