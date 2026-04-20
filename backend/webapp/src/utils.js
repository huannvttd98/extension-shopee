export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { hour12: false });
}

export function fmtRelative(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s trước`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.round(hr / 24);
  return `${day} ngày trước`;
}

export function fmtPrice(n) {
  if (n == null) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  // Shopee API trả giá × 100_000 (micro-cents). Giá thật < 1tr thì hiện raw.
  const normalized = v >= 1e6 ? Math.round(v / 1e5) : v;
  return normalized.toLocaleString("vi-VN") + " đ";
}

export function fmtNumber(n) {
  if (n == null) return "0";
  return Number(n).toLocaleString("vi-VN");
}

export function productImageUrl(hash, size = "tn") {
  if (!hash || typeof hash !== "string") return null;
  return size === "full"
    ? `https://down-vn.img.susercontent.com/file/${hash}`
    : `https://down-vn.img.susercontent.com/file/${hash}_${size}`;
}

export function productShopeeUrl(shopId, itemId) {
  if (!shopId || !itemId) return null;
  return `https://shopee.vn/product/${shopId}/${itemId}`;
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v != null && v !== "") p.set(k, String(v));
  }
  return p.toString();
}
