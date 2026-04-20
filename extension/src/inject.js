(() => {
  if (window.__pmCrawlInstalled) return;
  window.__pmCrawlInstalled = true;

  const PATTERNS = [
    /\/api\/v4\/search\/search_items/i,
    /\/api\/v4\/search\/product_search/i,
    /\/api\/v4\/recommend\/recommend/i,
    /\/api\/v4\/pdp\/get_pc/i,
    /\/api\/v4\/pdp\/get/i,
    /\/api\/v4\/shop\/get_shop_detail/i,
    /\/api\/v4\/shop\/search_items/i,
    /\/api\/v4\/catalog\/get_sub_categories/i,
    /\/api\/v4\/flash_sale/i,
  ];

  const ENDPOINT_RE = /\/api\/v4\/([^?#]+?)(?:[?#]|$)/i;

  function endpointOf(url) {
    try {
      const m = String(url).match(ENDPOINT_RE);
      return m ? m[1] : "unknown";
    } catch (_) {
      return "unknown";
    }
  }

  function shouldCapture(url) {
    if (!url) return false;
    const s = String(url);
    return PATTERNS.some((re) => re.test(s));
  }

  function send(url, payload) {
    try {
      window.postMessage(
        {
          source: "pm-crawl",
          url: String(url),
          endpoint: endpointOf(url),
          payload,
          ts: Date.now(),
        },
        "*"
      );
    } catch (_) {
      /* ignore */
    }
  }

  function extractItems(json) {
    if (!json || typeof json !== "object") return [];
    if (Array.isArray(json.items)) return json.items;
    if (json.data) {
      if (Array.isArray(json.data.items)) return json.data.items;
      if (Array.isArray(json.data.sections)) {
        const out = [];
        for (const s of json.data.sections) {
          if (Array.isArray(s.data?.item)) out.push(...s.data.item);
          if (Array.isArray(s.items)) out.push(...s.items);
        }
        if (out.length) return out;
      }
      if (json.data.item) return [{ data: { item: json.data.item } }];
    }
    return [];
  }

  // ---------- fetch hook ----------
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const response = await origFetch.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input?.url;
      if (shouldCapture(url)) {
        response
          .clone()
          .json()
          .then((json) => {
            const items = extractItems(json);
            if (items.length) send(url, { items });
          })
          .catch(() => {});
      }
    } catch (_) {
      /* ignore */
    }
    return response;
  };

  // ---------- XHR hook ----------
  const OrigXHR = window.XMLHttpRequest;
  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;

  OrigXHR.prototype.open = function (method, url) {
    this.__pmUrl = url;
    return origOpen.apply(this, arguments);
  };

  OrigXHR.prototype.send = function (body) {
    const url = this.__pmUrl;
    if (shouldCapture(url)) {
      this.addEventListener("load", function () {
        try {
          if (this.readyState !== 4) return;
          const ct = this.getResponseHeader("content-type") || "";
          if (!/json/i.test(ct) && typeof this.responseText !== "string") return;
          const text = this.responseText;
          if (!text) return;
          let json;
          try {
            json = JSON.parse(text);
          } catch (_) {
            return;
          }
          const items = extractItems(json);
          if (items.length) send(url, { items });
        } catch (_) {
          /* ignore */
        }
      });
    }
    return origSend.apply(this, arguments);
  };
})();
