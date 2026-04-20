import { currentPath } from "../router.js";

const NAV = [
  { path: "/", label: "Tổng quan" },
  { path: "/products", label: "Sản phẩm" },
  { path: "/sessions", label: "Phiên quét" },
];

function navLink(item, active) {
  const base =
    "px-3 py-2 rounded-md text-sm font-medium transition-colors";
  const cls = active
    ? `${base} bg-blue-600 text-white`
    : `${base} text-slate-600 hover:bg-slate-200`;
  return `<a href="#${item.path}" class="${cls}">${item.label}</a>`;
}

export function renderLayout(innerHtml) {
  const path = currentPath();
  const activePrefix = (p) => {
    if (p === "/") return path === "/" || path === "";
    return path === p || path.startsWith(p + "/");
  };

  return `
    <header class="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div class="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
        <a href="#/" class="flex items-center gap-2 font-semibold text-slate-900">
          <img src="/app/icon.svg" alt="" class="w-7 h-7" />
          ProductMap
        </a>
        <nav class="flex gap-1 ml-4">
          ${NAV.map((n) => navLink(n, activePrefix(n.path))).join("")}
        </nav>
        <div class="ml-auto text-xs text-slate-400">v0.1.0</div>
      </div>
    </header>
    <main class="max-w-6xl mx-auto px-4 py-6">
      ${innerHtml}
    </main>
  `;
}

export function mountHtml(mount, html) {
  mount.innerHTML = renderLayout(html);
}
