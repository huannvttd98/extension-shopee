import { api } from "../api.js";
import { mountHtml } from "../components/layout.js";
import {
  fmtPrice,
  fmtNumber,
  fmtDate,
  productImageUrl,
  productShopeeUrl,
  escapeHtml,
} from "../utils.js";

export async function productDetailPage({ params, mount }) {
  const id = params.id;
  const p = await api.getProduct(id);

  const images =
    Array.isArray(p.images_json) && p.images_json.length
      ? p.images_json
      : p.image
      ? [p.image]
      : [];
  const imgTags = images
    .map(
      (hash) => `
      <img src="${productImageUrl(hash, "full")}" loading="lazy" referrerpolicy="no-referrer"
           class="w-20 h-20 object-cover rounded border border-slate-200 bg-slate-100" />`
    )
    .join("");

  const mainImg = images.length
    ? `<img src="${productImageUrl(images[0], "full")}" referrerpolicy="no-referrer"
         class="w-full aspect-square object-cover rounded-lg bg-slate-100" />`
    : `<div class="w-full aspect-square rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">no image</div>`;

  const shopeeUrl = productShopeeUrl(p.shop_id, p.id);
  const shopHtml = p.shop
    ? `
    <div class="bg-white rounded-lg border border-slate-200 p-4">
      <div class="text-xs text-slate-500 mb-2">Shop</div>
      <div class="font-semibold text-slate-900">${escapeHtml(p.shop.name || "—")}</div>
      <div class="text-sm text-slate-600 mt-1">
        ${p.shop.location ? escapeHtml(p.shop.location) : ""}
        ${p.shop.rating != null ? ` · ★ ${p.shop.rating}` : ""}
      </div>
      <div class="text-xs text-slate-400 mt-2">ID ${p.shop.id}</div>
    </div>`
    : "";

  const categoryHtml = p.category
    ? `
    <div class="bg-white rounded-lg border border-slate-200 p-4">
      <div class="text-xs text-slate-500 mb-2">Category</div>
      <div class="font-semibold text-slate-900">${escapeHtml(p.category.name || `#${p.category.id}`)}</div>
      <div class="text-xs text-slate-400 mt-2">Level ${p.category.level ?? "?"}</div>
    </div>`
    : "";

  const rawPreview = p.raw_json
    ? JSON.stringify(p.raw_json, null, 2).slice(0, 20000)
    : "";

  mountHtml(
    mount,
    `
    <a href="#/products" class="text-sm text-blue-600 hover:underline mb-3 sm:mb-4 inline-block">← Quay lại danh sách</a>

    <div class="grid md:grid-cols-2 gap-4 sm:gap-6 mb-6">
      <div>
        ${mainImg}
        ${imgTags ? `<div class="flex gap-2 mt-3 flex-wrap">${imgTags}</div>` : ""}
      </div>

      <div class="space-y-3 sm:space-y-4">
        <h1 class="text-lg sm:text-xl font-semibold text-slate-900">${escapeHtml(p.name || "(no name)")}</h1>
        <div class="text-2xl sm:text-3xl font-bold text-rose-600">${fmtPrice(p.price)}</div>

        <div class="grid grid-cols-2 gap-2 sm:gap-3 text-sm">
          <div class="bg-white rounded border border-slate-200 p-2.5 sm:p-3">
            <div class="text-xs text-slate-500">Đã bán</div>
            <div class="font-semibold">${fmtNumber(p.sold)}</div>
          </div>
          <div class="bg-white rounded border border-slate-200 p-2.5 sm:p-3">
            <div class="text-xs text-slate-500">Tổng bán</div>
            <div class="font-semibold">${fmtNumber(p.historical_sold)}</div>
          </div>
          <div class="bg-white rounded border border-slate-200 p-2.5 sm:p-3">
            <div class="text-xs text-slate-500">Rating</div>
            <div class="font-semibold text-amber-500">
              ${p.rating_avg != null ? `★ ${Number(p.rating_avg).toFixed(1)} (${fmtNumber(p.rating_count)})` : "—"}
            </div>
          </div>
          <div class="bg-white rounded border border-slate-200 p-2.5 sm:p-3">
            <div class="text-xs text-slate-500">Lượt thích</div>
            <div class="font-semibold">${fmtNumber(p.liked_count)}</div>
          </div>
          <div class="bg-white rounded border border-slate-200 p-2.5 sm:p-3 col-span-2">
            <div class="text-xs text-slate-500">Stock</div>
            <div class="font-semibold">${fmtNumber(p.stock)}</div>
          </div>
        </div>

        ${shopHtml}
        ${categoryHtml}

        <div class="text-xs text-slate-500 space-y-1 break-all">
          <div>ID: <code class="bg-slate-100 px-1 rounded">${p.id}</code></div>
          ${p.brand ? `<div>Brand: ${escapeHtml(p.brand)}</div>` : ""}
          ${p.location ? `<div>Location: ${escapeHtml(p.location)}</div>` : ""}
          <div>First seen: ${fmtDate(p.first_seen_at)}</div>
          <div>Last seen: ${fmtDate(p.last_seen_at)}</div>
        </div>

        ${
          shopeeUrl
            ? `<a href="${shopeeUrl}" target="_blank" rel="noopener"
                  class="block text-center bg-orange-500 text-white py-3 rounded-md font-medium text-sm sm:text-base hover:bg-orange-600">
                Mở trên Shopee ↗
              </a>`
            : ""
        }
      </div>
    </div>

    ${
      rawPreview
        ? `
    <details class="bg-white rounded-lg border border-slate-200 p-4 mt-6">
      <summary class="cursor-pointer text-sm font-medium text-slate-700">Raw JSON (dev)</summary>
      <pre class="mt-3 text-xs text-slate-600 overflow-x-auto">${escapeHtml(rawPreview)}</pre>
    </details>`
        : ""
    }
  `
  );
}
