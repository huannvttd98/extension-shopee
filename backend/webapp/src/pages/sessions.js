import { api } from "../api.js";
import { mountHtml } from "../components/layout.js";
import { sessionRowHtml } from "../components/session-row.js";
import { fmtNumber, escapeHtml } from "../utils.js";
import { navigate } from "../router.js";

const PAGE_SIZE = 20;
let pollTimer = null;

async function load(mount, query) {
  const status = query.status || "";
  const keyword = query.keyword || "";
  const offset = Number.parseInt(query.offset || "0", 10) || 0;

  const data = await api.listSessions({
    status: status || undefined,
    keyword: keyword || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const statusOptions = ["", "queued", "running", "done", "aborted", "error"]
    .map(
      (s) =>
        `<option value="${s}" ${s === status ? "selected" : ""}>${s || "Tất cả"}</option>`
    )
    .join("");

  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const canPrev = offset > 0;
  const canNext = offset + data.items.length < data.total;

  mountHtml(
    mount,
    `
    <div class="bg-white border border-slate-200 rounded-lg p-4 mb-5">
      <div class="text-sm font-semibold text-slate-700 mb-2">Tạo job quét mới</div>
      <form id="jForm" class="flex flex-wrap gap-2 items-center">
        <input id="jKw" type="text" name="keyword" required
               placeholder="Từ khoá cần quét (vd: bàn làm việc)"
               class="flex-1 min-w-[240px] px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input id="jMax" type="number" min="5" max="200" value="20"
               title="Số lần scroll mỗi trang"
               class="w-24 px-3 py-2 border border-slate-300 rounded-md text-sm" />
        <button type="submit" class="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700">
          Thêm vào queue
        </button>
        <span id="jMsg" class="text-xs text-slate-500"></span>
      </form>
      <div class="text-xs text-slate-500 mt-2">
        Extension đã cài sẽ tự claim job trong ~30s và bắt đầu quét.
      </div>
    </div>

    <div class="flex flex-col md:flex-row md:items-center gap-3 mb-5">
      <form id="sForm" class="flex gap-2 flex-1">
        <input id="sKw" type="text" name="keyword" value="${escapeHtml(keyword)}"
               placeholder="Lọc theo keyword..."
               class="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <select id="sStatus" class="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white">
          ${statusOptions}
        </select>
        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
          Lọc
        </button>
      </form>
      <div class="text-sm text-slate-500">
        ${fmtNumber(data.total)} phiên
      </div>
    </div>

    ${
      data.items.length
        ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${data.items.map(sessionRowHtml).join("")}
          </div>`
        : `<div class="text-slate-400 text-center py-12">Không có phiên quét nào.</div>`
    }

    <div class="flex justify-center gap-3 mt-6">
      <button id="sPrev" ${canPrev ? "" : "disabled"}
              class="px-4 py-2 rounded-md text-sm border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
        ← Trang trước
      </button>
      <button id="sNext" ${canNext ? "" : "disabled"}
              class="px-4 py-2 rounded-md text-sm border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
        Trang sau →
      </button>
    </div>
  `
  );

  document.getElementById("jForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const kw = document.getElementById("jKw").value.trim();
    const mx = Number.parseInt(document.getElementById("jMax").value, 10) || 20;
    const msg = document.getElementById("jMsg");
    if (!kw) {
      msg.textContent = "Thiếu từ khoá";
      return;
    }
    msg.textContent = "Đang tạo…";
    try {
      const r = await api.createJob({ keyword: kw, max_scrolls: mx });
      msg.textContent = `✓ Đã tạo job #${r.id}`;
      document.getElementById("jKw").value = "";
      load(mount, query).catch(() => {});
    } catch (err) {
      msg.textContent = `Lỗi: ${err.message}`;
    }
  });

  document.getElementById("sForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const newKw = document.getElementById("sKw").value.trim();
    const newStatus = document.getElementById("sStatus").value;
    const p = new URLSearchParams();
    if (newKw) p.set("keyword", newKw);
    if (newStatus) p.set("status", newStatus);
    navigate("/sessions" + (p.toString() ? "?" + p.toString() : ""));
  });

  const gotoOffset = (newOffset) => {
    const p = new URLSearchParams();
    if (keyword) p.set("keyword", keyword);
    if (status) p.set("status", status);
    if (newOffset > 0) p.set("offset", String(newOffset));
    navigate("/sessions" + (p.toString() ? "?" + p.toString() : ""));
    window.scrollTo(0, 0);
  };
  if (canPrev) document.getElementById("sPrev").onclick = () => gotoOffset(prevOffset);
  if (canNext) document.getElementById("sNext").onclick = () => gotoOffset(nextOffset);

  return data.items.some((s) => s.status === "running" || s.status === "queued");
}

export async function sessionsPage({ mount, query }) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  const hasRunning = await load(mount, query);
  if (hasRunning) {
    pollTimer = setInterval(
      () => load(mount, query).catch(() => {}),
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
