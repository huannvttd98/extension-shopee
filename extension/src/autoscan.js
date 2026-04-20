// ProductMap auto-scan content script.
// Chỉ kích hoạt khi URL có ?pm_autoscan=1 (do background tự thêm khi mở tab quét).
//
// Shopee dùng pagination rời (?page=0, ?page=1, ...). Flow:
//   1. Scroll xuống bottom trên page hiện tại để trigger API load
//   2. Khi scrollHeight ổn định N tick → page load xong
//   3. Nếu có item ở page này → navigate ?page=N+1
//   4. Nếu KHÔNG có item → coi như vượt quá tổng page → dừng
//   5. Đến max_pages → dừng
// inject.js sẵn có sẽ hook fetch response và gửi về backend như luồng Phase 1.

(() => {
  if (globalThis.__pmAutoscanInstalled) return;
  globalThis.__pmAutoscanInstalled = true;

  const url = new URL(location.href);
  if (url.searchParams.get("pm_autoscan") !== "1") return;

  const maxScrollsPerPage = clampInt(url.searchParams.get("pm_max"), 20, 5, 200);
  const maxPages = clampInt(url.searchParams.get("pm_max_pages"), 100, 1, 1000);
  const intervalMs = clampInt(url.searchParams.get("pm_interval"), 1800, 800, 10000);
  const currentPage = clampInt(url.searchParams.get("page"), 0, 0, 10000);
  const STUCK_LIMIT = 3;

  let lastHeight = 0;
  let stuckTicks = 0;
  let scrollTicks = 0;
  let itemsThisPage = 0;
  let intervalId = null;
  let finished = false;

  function clampInt(raw, def, min, max) {
    const n = Number.parseInt(raw || "", 10);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  }

  function notify(msg) {
    // SW có thể đang sleep/restart — sendMessage có thể throw sync hoặc reject.
    // Content script không thể retry hữu ích → chấp nhận drop 1 progress event.
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_e) {
      // ignore: SW context lost, sẽ phục hồi ở tick sau
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
      currentPage,
      url: location.href,
    });
  }

  function gotoNextPage() {
    if (finished) return;
    finished = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    if (itemsThisPage === 0) {
      // Page này không có item → đã vượt quá tổng page của keyword.
      notify({
        type: "pm-autoscan-done",
        reason: "no-more-items",
        currentPage,
      });
      return;
    }
    if (currentPage + 1 >= maxPages) {
      notify({ type: "pm-autoscan-done", reason: "max-pages", currentPage });
      return;
    }

    // Navigate → autoscan.js chạy lại trong page mới.
    notify({ type: "pm-autoscan-page-end", currentPage, itemsThisPage });
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set("page", String(currentPage + 1));
    nextUrl.searchParams.set("pm_autoscan", "1");
    location.href = nextUrl.toString();
  }

  // Đếm item từ message của inject.js — chỉ tính endpoint search_items, bỏ qua recommend/ads.
  // Verify origin: message phải đến từ cùng page-world (same-origin).
  window.addEventListener("message", (ev) => {
    if (ev.origin !== location.origin) return;
    const d = ev.data;
    if (d?.source !== "pm-crawl") return;
    const endpoint = String(d.endpoint || "");
    if (!/search\/(search_items|product_search)/i.test(endpoint)) return;
    const items = d.payload?.items;
    if (!Array.isArray(items)) return;
    itemsThisPage += items.length;
    notify({
      type: "pm-autoscan-progress",
      itemsDelta: items.length,
      currentPage,
    });
  });

  function tick() {
    if (finished) return;
    scrollTicks++;

    const h = document.documentElement.scrollHeight;
    if (h === lastHeight) {
      stuckTicks++;
      if (stuckTicks >= STUCK_LIMIT) {
        // Page đã load xong toàn bộ → chuyển page tiếp theo.
        gotoNextPage();
        return;
      }
    } else {
      stuckTicks = 0;
      lastHeight = h;
    }

    if (scrollTicks > maxScrollsPerPage) {
      // Không nên scroll vô hạn 1 page — nếu scrollHeight vẫn tăng liên tục
      // thì page đang ở infinite-scroll mode, cứ nav tiếp cho an toàn.
      gotoNextPage();
      return;
    }

    // Một số browser cũ không accept options object → fallback sang signature (x,y).
    try {
      window.scrollTo({ top: h, behavior: "smooth" });
    } catch (_e) {
      window.scrollTo(0, h);
    }
  }

  function start() {
    notify({
      type: "pm-autoscan-progress",
      itemsDelta: 0,
      currentPage,
      started: true,
    });
    intervalId = setInterval(tick, intervalMs);
  }

  // Chờ SPA hydrate xong rồi mới bắt đầu scroll.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(start, 2500), {
      once: true,
    });
  } else {
    setTimeout(start, 2500);
  }

  // Background có thể gửi lệnh dừng chủ động (trước khi đóng tab).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "pm-autoscan-abort") {
      finish("user-stop");
    }
  });
})();
