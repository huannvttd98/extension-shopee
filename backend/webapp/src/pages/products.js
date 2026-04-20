import { api } from "../api.js";
import { mountHtml } from "../components/layout.js";
import { productListHtml } from "../components/product-card.js";
import { fmtNumber, escapeHtml } from "../utils.js";
import { navigate } from "../router.js";

const PAGE_SIZE = 24;
const PRICE_SCALE = 100_000; // Shopee raw = VND × 100_000

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

function toPositiveInt(v) {
  if (v == null || v === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function productsPage({ mount, query }) {
  const q = query.q || "";
  const sortOpt = query.sort || "last_seen_at|desc";
  const [sort, order] = sortOpt.split("|");
  const offset = Number.parseInt(query.offset || "0", 10) || 0;
  const catid = toPositiveInt(query.catid);
  const priceMinVnd = toPositiveInt(query.price_min);
  const priceMaxVnd = toPositiveInt(query.price_max);

  const [data, categories] = await Promise.all([
    api.listProducts({
      q,
      sort,
      order,
      limit: PAGE_SIZE,
      offset,
      category_id: catid,
      min_price: priceMinVnd == null ? null : priceMinVnd * PRICE_SCALE,
      max_price: priceMaxVnd == null ? null : priceMaxVnd * PRICE_SCALE,
    }),
    api.listCategories().catch(() => []),
  ]);

  const sortSelect = SORT_OPTIONS.map(
    (o) =>
      `<option value="${o.value}" ${o.value === sortOpt ? "selected" : ""}>${o.label}</option>`
  ).join("");

  const catOptions =
    `<option value="">Tất cả danh mục</option>` +
    categories
      .map((c) => {
        const label = c.name
          ? escapeHtml(c.name)
          : `Danh mục #${c.id}`;
        const selected = String(c.id) === String(catid) ? "selected" : "";
        return `<option value="${c.id}" ${selected}>${label} (${fmtNumber(
          c.product_count
        )})</option>`;
      })
      .join("");

  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const canPrev = offset > 0;
  const canNext = offset + data.items.length < data.total;

  const hasFilter =
    catid != null || priceMinVnd != null || priceMaxVnd != null || !!q;

  mountHtml(
    mount,
    `
    <form id="pForm" class="flex flex-wrap gap-2 mb-3 items-center">
      <input id="pQ" type="text" name="q" value="${escapeHtml(q)}"
             placeholder="Tìm theo tên sản phẩm..."
             class="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      <select id="pCat" class="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white max-w-[260px]">
        ${catOptions}
      </select>
      <div class="flex items-center gap-1">
        <input id="pMin" type="number" min="0" step="1000"
               value="${priceMinVnd ?? ""}" placeholder="Từ (đ)"
               class="w-28 px-2 py-2 border border-slate-300 rounded-md text-sm" />
        <span class="text-slate-400">–</span>
        <input id="pMax" type="number" min="0" step="1000"
               value="${priceMaxVnd ?? ""}" placeholder="Đến (đ)"
               class="w-28 px-2 py-2 border border-slate-300 rounded-md text-sm" />
      </div>
      <select id="pSort" class="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white">
        ${sortSelect}
      </select>
      <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
        Lọc
      </button>
      ${hasFilter ? `<button type="button" id="pReset" class="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 underline">Xoá lọc</button>` : ""}
    </form>

    <div class="text-sm text-slate-500 mb-4">
      ${fmtNumber(data.total)} SP · ${data.items.length ? `${offset + 1}–${offset + data.items.length}` : "không có kết quả"}
    </div>

    ${
      data.items.length
        ? productListHtml(data.items)
        : `<div class="py-10 text-center text-slate-500 text-sm">Không có sản phẩm khớp bộ lọc.</div>`
    }

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

  const buildUrl = ({ newQ, newSort, newCat, newMin, newMax, newOffset }) => {
    const p = new URLSearchParams();
    if (newQ) p.set("q", newQ);
    if (newSort && newSort !== "last_seen_at|desc") p.set("sort", newSort);
    if (newCat) p.set("catid", newCat);
    if (newMin) p.set("price_min", newMin);
    if (newMax) p.set("price_max", newMax);
    if (newOffset && newOffset > 0) p.set("offset", String(newOffset));
    return "/products" + (p.toString() ? "?" + p.toString() : "");
  };

  const form = document.getElementById("pForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    navigate(
      buildUrl({
        newQ: document.getElementById("pQ").value.trim(),
        newSort: document.getElementById("pSort").value,
        newCat: document.getElementById("pCat").value,
        newMin: document.getElementById("pMin").value.trim(),
        newMax: document.getElementById("pMax").value.trim(),
        newOffset: 0,
      })
    );
  });

  const resetBtn = document.getElementById("pReset");
  if (resetBtn) resetBtn.onclick = () => navigate("/products");

  const gotoOffset = (newOffset) => {
    navigate(
      buildUrl({
        newQ: q,
        newSort: sortOpt,
        newCat: catid ?? "",
        newMin: priceMinVnd ?? "",
        newMax: priceMaxVnd ?? "",
        newOffset,
      })
    );
    window.scrollTo(0, 0);
  };

  if (canPrev) document.getElementById("pPrev").onclick = () => gotoOffset(prevOffset);
  if (canNext) document.getElementById("pNext").onclick = () => gotoOffset(nextOffset);
}
