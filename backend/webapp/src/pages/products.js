import { api } from "../api.js";
import { mountHtml } from "../components/layout.js";
import { productListHtml } from "../components/product-card.js";
import { fmtNumber, escapeHtml } from "../utils.js";
import { navigate } from "../router.js";

const PAGE_SIZE = 24;

const SORT_OPTIONS = [
  { value: "last_seen_at|desc", label: "Mới cập nhật" },
  { value: "first_seen_at|desc", label: "Mới thu thập" },
  { value: "sold|desc", label: "Bán chạy nhất" },
  { value: "historical_sold|desc", label: "Tổng bán cao nhất" },
  { value: "price|asc", label: "Giá thấp → cao" },
  { value: "price|desc", label: "Giá cao → thấp" },
  { value: "rating_avg|desc", label: "Rating cao" },
  { value: "liked_count|desc", label: "Nhiều lượt thích" },
];

export async function productsPage({ mount, query }) {
  const q = query.q || "";
  const sortOpt = query.sort || "last_seen_at|desc";
  const [sort, order] = sortOpt.split("|");
  const offset = Number.parseInt(query.offset || "0", 10) || 0;

  const data = await api.listProducts({ q, sort, order, limit: PAGE_SIZE, offset });

  const sortSelect = SORT_OPTIONS.map(
    (o) =>
      `<option value="${o.value}" ${o.value === sortOpt ? "selected" : ""}>${o.label}</option>`
  ).join("");

  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const canPrev = offset > 0;
  const canNext = offset + data.items.length < data.total;

  mountHtml(
    mount,
    `
    <div class="flex flex-col md:flex-row md:items-center gap-3 mb-5">
      <form id="pForm" class="flex gap-2 flex-1">
        <input id="pQ" type="text" name="q" value="${escapeHtml(q)}"
               placeholder="Tìm theo tên sản phẩm..."
               class="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <select id="pSort" class="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white">
          ${sortSelect}
        </select>
        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
          Tìm
        </button>
      </form>
      <div class="text-sm text-slate-500">
        ${fmtNumber(data.total)} SP · ${offset + 1}–${offset + data.items.length}
      </div>
    </div>

    ${productListHtml(data.items)}

    <div class="flex justify-center gap-3 mt-6">
      <button id="pPrev" ${canPrev ? "" : "disabled"}
              class="px-4 py-2 rounded-md text-sm border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
        ← Trang trước
      </button>
      <button id="pNext" ${canNext ? "" : "disabled"}
              class="px-4 py-2 rounded-md text-sm border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
        Trang sau →
      </button>
    </div>
  `
  );

  const form = document.getElementById("pForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const newQ = document.getElementById("pQ").value.trim();
    const newSort = document.getElementById("pSort").value;
    const p = new URLSearchParams();
    if (newQ) p.set("q", newQ);
    if (newSort !== "last_seen_at|desc") p.set("sort", newSort);
    navigate("/products" + (p.toString() ? "?" + p.toString() : ""));
  });

  const gotoOffset = (newOffset) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sortOpt !== "last_seen_at|desc") p.set("sort", sortOpt);
    if (newOffset > 0) p.set("offset", String(newOffset));
    navigate("/products" + (p.toString() ? "?" + p.toString() : ""));
    window.scrollTo(0, 0);
  };

  if (canPrev) document.getElementById("pPrev").onclick = () => gotoOffset(prevOffset);
  if (canNext) document.getElementById("pNext").onclick = () => gotoOffset(nextOffset);
}
