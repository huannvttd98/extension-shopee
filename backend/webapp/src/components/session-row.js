import { fmtDate, fmtNumber, escapeHtml } from "../utils.js";

export function statusBadgeHtml(status) {
  const s = status || "idle";
  return `<span class="status-badge ${s}">${s}</span>`;
}

export function sessionRowHtml(s) {
  const reasonStr = s.reason ? ` · ${escapeHtml(s.reason)}` : "";
  return `
    <a href="#/sessions/${s.id}"
       class="block bg-white rounded-lg border border-slate-200 hover:border-blue-500 p-4 transition-colors">
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
  `;
}
