// Same-origin: FastAPI mount /app cùng host với /api.
const BASE = "";

async function getJson(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export const api = {
  stats: () => getJson("/api/stats"),

  listProducts: ({ q, sort, order, limit, offset } = {}) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sort) p.set("sort", sort);
    if (order) p.set("order", order);
    p.set("limit", String(limit ?? 24));
    p.set("offset", String(offset ?? 0));
    return getJson(`/api/products?${p.toString()}`);
  },

  getProduct: (id) => getJson(`/api/products/${id}`),

  listSessions: ({ status, keyword, limit, offset } = {}) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (keyword) p.set("keyword", keyword);
    p.set("limit", String(limit ?? 30));
    p.set("offset", String(offset ?? 0));
    return getJson(`/api/scan-sessions?${p.toString()}`);
  },

  getSession: (id) => getJson(`/api/scan-sessions/${id}`),

  listSessionProducts: (id, { limit, offset } = {}) => {
    const p = new URLSearchParams();
    p.set("limit", String(limit ?? 30));
    p.set("offset", String(offset ?? 0));
    return getJson(`/api/scan-sessions/${id}/products?${p.toString()}`);
  },
};
