import { fmtPrice, fmtNumber, productImageUrl, productShopeeUrl, escapeHtml } from "../utils.js";

export function productCardHtml(p) {
  const imgUrl = productImageUrl(p.image, "tn");
  const detailUrl = `#/products/${p.id}`;
  const shopeeUrl = productShopeeUrl(p.shop_id, p.id);
  const name = escapeHtml(p.name || "(chưa có tên)");

  const img = imgUrl
    ? `<img src="${imgUrl}" alt="${name}" loading="lazy" referrerpolicy="no-referrer"
         class="w-full h-40 object-cover bg-slate-100" />`
    : `<div class="w-full h-40 bg-slate-100 flex items-center justify-center text-slate-400 text-sm">
         no image
       </div>`;

  const rating = p.rating_avg != null
    ? `<span class="text-amber-500">★ ${Number(p.rating_avg).toFixed(1)}</span>`
    : "";

  return `
    <article class="bg-white rounded-lg border border-slate-200 overflow-hidden hover:border-blue-500 transition-colors">
      <a href="${detailUrl}" class="block">
        ${img}
        <div class="p-3 space-y-1">
          <h3 class="text-sm text-slate-800 line-clamp-2 min-h-[2.5rem]">${name}</h3>
          <div class="text-rose-600 font-semibold">${fmtPrice(p.price)}</div>
          <div class="text-xs text-slate-500 flex justify-between">
            <span>Đã bán: ${fmtNumber(p.sold)}</span>
            ${rating}
          </div>
        </div>
      </a>
      ${
        shopeeUrl
          ? `<a href="${shopeeUrl}" target="_blank" rel="noopener"
              class="block text-center text-xs bg-slate-50 text-slate-600 py-1.5 border-t border-slate-200 hover:bg-blue-50 hover:text-blue-700">
               Xem trên Shopee →
             </a>`
          : ""
      }
    </article>
  `;
}

export function productListHtml(items) {
  if (!items.length) {
    return `<div class="text-slate-400 text-center py-12">Chưa có sản phẩm.</div>`;
  }
  return `
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      ${items.map(productCardHtml).join("")}
    </div>
  `;
}
