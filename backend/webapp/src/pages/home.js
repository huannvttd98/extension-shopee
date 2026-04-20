import { api } from "../api.js";
import { mountHtml } from "../components/layout.js";
import { productListHtml } from "../components/product-card.js";
import { sessionRowHtml } from "../components/session-row.js";
import { fmtNumber } from "../utils.js";

let pollTimer = null;

async function load(mount) {
  const [stats, recentSessions, recentProducts] = await Promise.all([
    api.stats(),
    api.listSessions({ limit: 5 }),
    api.listProducts({ sort: "last_seen_at", order: "desc", limit: 8 }),
  ]);

  const runningCount = recentSessions.items.filter((s) => s.status === "running").length;

  const statsCards = [
    ["Tổng SP", fmtNumber(stats.products_total)],
    ["Tổng shops", fmtNumber(stats.shops_total)],
    ["Tổng phiên quét", fmtNumber(stats.crawl_log_total)],
    ["Đang chạy", `${runningCount}`, runningCount > 0 ? "running" : ""],
  ]
    .map(
      ([label, value, highlight]) => `
      <div class="bg-white rounded-lg border border-slate-200 p-3 sm:p-4 ${
        highlight === "running" ? "ring-2 ring-blue-400" : ""
      }">
        <div class="text-xs text-slate-500 truncate">${label}</div>
        <div class="text-xl sm:text-2xl font-bold text-slate-900 mt-1">${value}</div>
      </div>
    `
    )
    .join("");

  const sessionsHtml = recentSessions.items.length
    ? recentSessions.items.map(sessionRowHtml).join("")
    : `<div class="text-slate-400 text-sm py-4">Chưa có phiên quét nào.</div>`;

  mountHtml(
    mount,
    `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-5 sm:mb-6">
      ${statsCards}
    </div>

    <section class="mb-6 sm:mb-8">
      <div class="flex items-center justify-between mb-3 gap-2">
        <h2 class="text-base sm:text-lg font-semibold text-slate-900 truncate">Phiên quét gần nhất</h2>
        <a href="#/sessions" class="text-sm text-blue-600 hover:underline shrink-0">Xem tất cả →</a>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${sessionsHtml}
      </div>
    </section>

    <section>
      <div class="flex items-center justify-between mb-3 gap-2">
        <h2 class="text-base sm:text-lg font-semibold text-slate-900 truncate">Sản phẩm mới nhất</h2>
        <a href="#/products" class="text-sm text-blue-600 hover:underline shrink-0">Xem tất cả →</a>
      </div>
      ${productListHtml(recentProducts.items)}
    </section>
  `
  );
}

export async function homePage({ mount }) {
  if (pollTimer) clearInterval(pollTimer);
  await load(mount);
  // Poll 5s để refresh nếu có session running.
  pollTimer = setInterval(() => load(mount).catch(() => {}), 5000);
}

// Stop polling khi user navigate đi chỗ khác.
window.addEventListener("hashchange", () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
