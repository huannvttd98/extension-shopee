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

  listProducts: ({
    q,
    sort,
    order,
    limit,
    offset,
    category_id,
    min_price,
    max_price,
  } = {}) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sort) p.set("sort", sort);
    if (order) p.set("order", order);
    if (category_id != null && category_id !== "") p.set("category_id", String(category_id));
    if (min_price != null && min_price !== "") p.set("min_price", String(min_price));
    if (max_price != null && max_price !== "") p.set("max_price", String(max_price));
    p.set("limit", String(limit ?? 24));
    p.set("offset", String(offset ?? 0));
    return getJson(`/api/products?${p.toString()}`);
  },

  getProduct: (id) => getJson(`/api/products/${id}`),

  listCategories: ({ non_empty = true } = {}) => {
    const p = new URLSearchParams();
    p.set("non_empty", non_empty ? "true" : "false");
    return getJson(`/api/categories?${p.toString()}`);
  },

  createJob: ({ keyword, max_scrolls } = {}) =>
    fetch(BASE + "/api/scan-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        keyword,
        source: "web",
        max_scrolls,
        status: "queued",
      }),
    }).then(async (r) => {
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status} ${txt.slice(0, 200)}`);
      }
      return r.json();
    }),

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

  deleteSession: (id) =>
    fetch(BASE + `/api/scan-sessions/${id}`, { method: "DELETE" }).then(
      async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} ${txt.slice(0, 200)}`);
        }
        return r.json();
      }
    ),
};
