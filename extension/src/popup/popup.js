const $ = (id) => document.getElementById(id);

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

loadConfig();
fetchStats();
setInterval(fetchStats, 1500);
