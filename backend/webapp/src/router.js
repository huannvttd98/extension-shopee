// Hash-based router để đơn giản + không cần server-side config wildcard.
// URL: /app/#/products, /app/#/products/123, /app/#/sessions/5

const routes = [];

export function route(pattern, handler) {
  // pattern: "/products/:id" → regex
  const keys = [];
  const regexStr =
    "^" +
    pattern.replace(/:(\w+)/g, (_m, k) => {
      keys.push(k);
      return "([^/]+)";
    }) +
    "/?$";
  routes.push({ regex: new RegExp(regexStr), keys, handler });
}

export function navigate(path) {
  location.hash = "#" + path;
}

export function currentPath() {
  const h = location.hash || "#/";
  return h.startsWith("#") ? h.slice(1) || "/" : h || "/";
}

export function startRouter(mount) {
  function render() {
    const path = currentPath();
    // Strip query string
    const [pathOnly, queryStr] = path.split("?");
    const query = Object.fromEntries(new URLSearchParams(queryStr || "").entries());

    for (const r of routes) {
      const m = r.regex.exec(pathOnly);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      Promise.resolve(r.handler({ params, query, mount })).catch((e) => {
        console.error(e);
        mount.innerHTML = `<div class="p-6 text-rose-600">Lỗi: ${e.message}</div>`;
      });
      return;
    }
    mount.innerHTML = `<div class="p-6 text-slate-500">404 — không tìm thấy trang</div>`;
  }

  window.addEventListener("hashchange", render);
  render();
}
