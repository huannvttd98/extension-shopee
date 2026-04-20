import { fmtDate, fmtNumber, escapeHtml } from "../utils.js";

export function statusBadgeHtml(status) {
  const s = status || "idle";
  return `<span class="status-badge ${s}">${s}</span>`;
}

export function sessionRowHtml(s) {
  const reasonStr = s.reason ? ` · ${escapeHtml(s.reason)}` : "";
  const kwAttr = escapeHtml(s.keyword || "");
  return `
    <div class="bg-white rounded-lg border border-slate-200 hover:border-blue-500 transition-colors overflow-hidden">
      <a href="#/sessions/${s.id}" class="block p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="font-semibold text-slate-900 truncate">${escapeHtml(s.keyword || "(no keyword)")}</div>
            <div class="text-xs text-slate-500 mt-1">
              #${s.id} · ${fmtDate(s.started_at)}${reasonStr}
            </div>
          </div>
          ${statusBadgeHtml(s.status)}
        </div>
        <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div><span class="text-slate-500">Pages:</span> <b>${fmtNumber(s.scroll_ticks)}</b></div>
          <div><span class="text-slate-500">Items:</span> <b>${fmtNumber(s.items_seen)}</b></div>
          <div><span class="text-slate-500">Upserted:</span> <b>${fmtNumber(s.products_upserted)}</b></div>
        </div>
      </a>
      <div class="border-t border-slate-100 px-3 py-2 flex justify-end bg-slate-50">
        <button type="button"
                class="js-delete-session text-xs text-red-600 hover:text-white hover:bg-red-600 px-2 py-1 rounded border border-red-200 hover:border-red-600 transition-colors"
                data-id="${s.id}" data-keyword="${kwAttr}"
                title="Xóa phiên và toàn bộ sản phẩm đã quét">
          Xóa phiên & sản phẩm
        </button>
      </div>
    </div>
  `;
}
