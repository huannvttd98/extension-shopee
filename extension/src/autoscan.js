// ProductMap auto-scan content script.
// Chỉ kích hoạt khi URL có ?pm_autoscan=1 (do background tự thêm khi mở tab quét).
// Tự scroll đến hết trang để trigger Shopee infinite-fetch; inject.js sẵn có sẽ hook
// response và gửi về backend như luồng Phase 1.

(() => {
  if (window.__pmAutoscanInstalled) return;
  window.__pmAutoscanInstalled = true;

  const params = new URL(location.href).searchParams;
  if (params.get("pm_autoscan") !== "1") return;

  const maxScrolls = clampInt(params.get("pm_max"), 200, 10, 2000);
  const intervalMs = clampInt(params.get("pm_interval"), 1800, 800, 10000);
  const STUCK_LIMIT = 3;

  let lastHeight = 0;
  let stuckTicks = 0;
  let scrollTicks = 0;
  let totalItemsSeen = 0;
  let intervalId = null;
  let finished = false;

  function clampInt(raw, def, min, max) {
    const n = parseInt(raw || "", 10);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  }

  function notify(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_) {
      /* SW waking up */
    }
  }

  function finish(reason) {
    if (finished) return;
    finished = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    notify({
      type: "pm-autoscan-done",
      reason,
      totalItemsSeen,
      scrollTicks,
      url: location.href,
    });
  }

  // Đếm item từ message của inject.js (cùng window, cùng page-world bridge).
  window.addEventListener("message", (ev) => {
    const d = ev?.data;
    if (!d || d.source !== "pm-crawl") return;
    const items = d.payload?.items;
    if (Array.isArray(items)) totalItemsSeen += items.length;
  });

  function tick() {
    if (finished) return;
    scrollTicks++;
    if (scrollTicks > maxScrolls) {
      finish("max-scrolls");
      return;
    }
    const h = document.documentElement.scrollHeight;
    if (h === lastHeight) {
      stuckTicks++;
      if (stuckTicks >= STUCK_LIMIT) {
        finish("no-more-content");
        return;
      }
    } else {
      stuckTicks = 0;
      lastHeight = h;
    }
    try {
      window.scrollTo({ top: h, behavior: "smooth" });
    } catch (_) {
      window.scrollTo(0, h);
    }
    notify({
      type: "pm-autoscan-progress",
      scrollTicks,
      totalItemsSeen,
      stuckTicks,
    });
  }

  function start() {
    notify({ type: "pm-autoscan-progress", scrollTicks: 0, totalItemsSeen: 0, started: true });
    intervalId = setInterval(tick, intervalMs);
  }

  // Chờ SPA hydrate xong rồi mới bắt đầu scroll.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(start, 2000), { once: true });
  } else {
    setTimeout(start, 2000);
  }

  // Background có thể gửi lệnh dừng chủ động (trước khi đóng tab).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "pm-autoscan-abort") {
      finish("user-stop");
    }
  });
})();
