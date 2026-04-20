(() => {
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("src/inject.js");
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  } catch (e) {
    console.warn("[pm-crawl] inject failed", e);
  }

  window.addEventListener("message", (ev) => {
    const data = ev?.data;
    if (!data || data.source !== "pm-crawl") return;
    const items = data?.payload?.items;
    if (!Array.isArray(items) || items.length === 0) return;

    chrome.runtime
      .sendMessage({
        type: "pm-capture",
        url: data.url,
        endpoint: data.endpoint,
        items,
        ts: data.ts,
      })
      .catch(() => {
        // Background may be waking up; silent fail, page won't retry.
      });
  });
})();
