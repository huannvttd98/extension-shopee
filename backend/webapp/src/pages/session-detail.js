import { api } from "../api.js";
import { mountHtml } from "../components/layout.js";
import { productListHtml } from "../components/product-card.js";
import { statusBadgeHtml } from "../components/session-row.js";
import { fmtDate, fmtNumber, escapeHtml } from "../utils.js";
import { navigate } from "../router.js";

const PAGE_SIZE = 24;
let pollTimer = null;

async function load(mount, id, query) {
  const offset = Number.parseInt(query.offset || "0", 10) || 0;

  const [s, prods] = await Promise.all([
    api.getSession(id),
    api.listSessionProducts(id, { limit: PAGE_SIZE, offset }),
  ]);

  const infoRows = [
    ["Keyword", escapeHtml(s.keyword || "—")],
    ["Status", statusBadgeHtml(s.status) + (s.reason ? ` <span class="text-slate-500">(${escapeHtml(s.reason)})</span>` : "")],
    ["Source", escapeHtml(s.source || "—")],
    ["Started", fmtDate(s.started_at)],
    ["Finished", fmtDate(s.finished_at)],
    ["Pages đã quét", fmtNumber(s.scroll_ticks)],
    ["Items API", fmtNumber(s.items_seen)],
    ["Upserted", fmtNumber(s.products_upserted)],
    ["Max scrolls/page", fmtNumber(s.max_scrolls)],
  ];

  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const canPrev = offset > 0;
  const canNext = offset + prods.items.length < prods.total;

  mountHtml(
    mount,
    `
    <a href="#/sessions" class="text-sm text-blue-600 hover:underline mb-4 inline-block">← Quay lại lịch sử</a>

    <div class="bg-white rounded-lg border border-slate-200 p-5 mb-6">
      <div class="flex items-center justify-between mb-3 gap-3">
        <h1 class="text-xl font-semibold text-slate-900">Phiên #${s.id}</h1>
        <div class="flex items-center gap-2">
          ${statusBadgeHtml(s.status)}
          <button id="sdDelete" type="button"
                  data-id="${s.id}" data-keyword="${escapeHtml(s.keyword || "")}"
                  class="text-xs text-red-600 hover:text-white hover:bg-red-600 px-3 py-1.5 rounded border border-red-200 hover:border-red-600 transition-colors"
                  title="Xóa phiên và toàn bộ sản phẩm đã quét">
            Xóa phiên & sản phẩm
          </button>
        </div>
      </div>
      <dl class="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        ${infoRows
          .map(
            ([k, v]) => `
          <div class="flex justify-between gap-3 border-b border-slate-100 pb-1">
            <dt class="text-slate-500">${k}</dt>
            <dd class="text-slate-800 text-right">${v}</dd>
          </div>`
          )
          .join("")}
      </dl>
      ${
        s.tab_url
          ? `<div class="text-xs text-slate-400 mt-3 truncate">URL: ${escapeHtml(s.tab_url)}</div>`
          : ""
      }
    </div>

    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-semibold text-slate-900">Sản phẩm đã quét (${fmtNumber(prods.total)})</h2>
      <div class="text-sm text-slate-500">${offset + 1}–${offset + prods.items.length}</div>
    </div>
    ${productListHtml(prods.items)}

    <div class="flex justify-center gap-3 mt-6">
      <button id="sdPrev" ${canPrev ? "" : "disabled"}
              class="px-4 py-2 rounded-md text-sm border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
        ← Trang trước
      </button>
      <button id="sdNext" ${canNext ? "" : "disabled"}
              class="px-4 py-2 rounded-md text-sm border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
        Trang sau →
      </button>
    </div>
  `
  );

  const gotoOffset = (newOffset) => {
    const p = new URLSearchParams();
    if (newOffset > 0) p.set("offset", String(newOffset));
    navigate(`/sessions/${id}` + (p.toString() ? "?" + p.toString() : ""));
    window.scrollTo(0, 0);
  };
  if (canPrev) document.getElementById("sdPrev").onclick = () => gotoOffset(prevOffset);
  if (canNext) document.getElementById("sdNext").onclick = () => gotoOffset(nextOffset);

  const delBtn = document.getElementById("sdDelete");
  if (delBtn) {
    delBtn.onclick = async () => {
      const sid = delBtn.dataset.id;
      const kw = delBtn.dataset.keyword || "(no keyword)";
      if (
        !confirm(
          `Xóa phiên #${sid} (${kw}) và TOÀN BỘ sản phẩm đã quét?\n\nKhông thể khôi phục.`
        )
      )
        return;
      delBtn.disabled = true;
      delBtn.textContent = "Đang xóa…";
      try {
        await api.deleteSession(sid);
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        navigate("/sessions");
      } catch (err) {
        delBtn.disabled = false;
        delBtn.textContent = "Xóa phiên & sản phẩm";
        alert(`Lỗi xóa phiên: ${err.message}`);
      }
    };
  }

  return s.status === "running";
}

export async function sessionDetailPage({ params, query, mount }) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  const isRunning = await load(mount, params.id, query);
  if (isRunning) {
    pollTimer = setInterval(
      () => load(mount, params.id, query).catch(() => {}),
      3000
    );
  }
}

window.addEventListener("hashchange", () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
