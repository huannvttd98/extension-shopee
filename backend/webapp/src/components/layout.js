import { currentPath } from "../router.js";

const NAV = [
  { path: "/", label: "Tổng quan" },
  { path: "/products", label: "Sản phẩm" },
  { path: "/sessions", label: "Phiên quét" },
];

function navLink(item, active) {
  const base =
    "px-3 py-3 md:py-2 rounded-md text-sm font-medium transition-colors text-center md:text-left";
  const cls = active
    ? `${base} bg-blue-600 text-white`
    : `${base} text-slate-700 hover:bg-slate-200`;
  return `<a href="#${item.path}" class="${cls}">${item.label}</a>`;
}

export function renderLayout(innerHtml) {
  const path = currentPath();
  const activePrefix = (p) => {
    if (p === "/") return path === "/" || path === "";
    return path === p || path.startsWith(p + "/");
  };

  return `
    <header class="bg-white border-b border-slate-200 sticky top-0 z-20">
      <div class="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-3 relative">
        <a href="#/" class="flex items-center gap-2 font-semibold text-slate-900 shrink-0">
          <img src="/app/icon.svg" alt="" class="w-7 h-7" />
          <span class="text-base sm:text-lg">ProductMap</span>
        </a>

        <input id="navToggle" type="checkbox" class="peer sr-only" aria-label="Toggle menu" />

        <nav class="
             hidden peer-checked:flex md:flex
             absolute md:static top-full left-0 right-0
             flex-col md:flex-row gap-1
             bg-white md:bg-transparent
             border-b md:border-0 border-slate-200
             shadow-md md:shadow-none
             p-3 md:p-0 md:ml-4
             ">
          ${NAV.map((n) => navLink(n, activePrefix(n.path))).join("")}
        </nav>

        <div class="ml-auto hidden md:block text-xs text-slate-400">v0.1.0</div>

        <label for="navToggle"
               class="md:hidden ml-auto inline-flex items-center justify-center w-11 h-11 rounded-md text-slate-700 hover:bg-slate-100 cursor-pointer"
               aria-label="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="4" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="18" x2="20" y2="18"/>
          </svg>
        </label>
      </div>
    </header>
    <main class="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      ${innerHtml}
    </main>
  `;
}

export function mountHtml(mount, html) {
  mount.innerHTML = renderLayout(html);
}
