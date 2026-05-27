/**
 * ObservaAI Companion — claude.ai content script
 *
 * Strategy:
 *   1. Inject a fetch interceptor into the MAIN world via a <script> tag so it
 *      can override window.fetch before any page code runs.
 *   2. The interceptor tees every response to /completion endpoints and parses
 *      the SSE stream for `message_limit` events (same data as claude-counter).
 *   3. Results are posted back to this ISOLATED world via window.postMessage.
 *   4. A MutationObserver on the DOM provides a fallback scrape for usage text.
 *   5. Debounced 5 s before forwarding to the background service worker.
 */

// ── 1. MAIN-world fetch interceptor ─────────────────────────────────────────

const interceptorCode = `
(function () {
  const _fetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = (input instanceof Request ? input.url : String(input));
    const res = await _fetch(input, init);

    // Only tap into streaming completion endpoints
    if (!res.body || (!url.includes('/completion') && !url.includes('/chat_completions'))) {
      return res;
    }

    const [pageStream, tapStream] = res.body.tee();

    // Parse our copy in the background — never blocks the page
    (async () => {
      const reader = tapStream.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let lastEvent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\\n');
          buf = lines.pop(); // keep incomplete final line

          for (const line of lines) {
            if (line.startsWith('event:')) {
              lastEvent = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              const raw = line.slice(5).trim();
              if (!raw) continue;
              try {
                const obj = JSON.parse(raw);
                if (lastEvent === 'message_limit' || obj.type === 'message_limit') {
                  window.postMessage({
                    source: 'observaai-claude',
                    remaining: obj.remaining,
                    resetAt: obj.resetAt,
                  }, '*');
                  lastEvent = '';
                }
              } catch (_) {}
            } else if (line === '') {
              lastEvent = '';
            }
          }
        }
      } catch (_) {}
    })();

    return new Response(pageStream, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };
})();
`;

// Inject at document_start so the override is in place before any page scripts
const s = document.createElement('script');
s.textContent = interceptorCode;
(document.head || document.documentElement).prepend(s);
s.remove();

// ── 2. ISOLATED world: receive messages + fallback DOM scrape ────────────────

let debounceTimer = null;
let lastRemaining = null;

function scheduleIngest() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(sendToBackground, 5000);
}

function sendToBackground() {
  if (lastRemaining === null) return;

  // Try to read the total from any visible usage element so we can derive used
  let total = 0;
  const totalSelectors = [
    '[data-testid="usage-limit"]',
    '[data-testid="message-limit-total"]',
    '[class*="usageLimit"]',
  ];
  for (const sel of totalSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const m = el.textContent.match(/(\d+)/);
      if (m) { total = parseInt(m[1], 10); break; }
    }
  }

  chrome.runtime.sendMessage({
    type: 'OBSERVAAI_USAGE',
    payload: {
      provider: 'claude',
      plan: 'Pro',
      hourly_used: total > 0 ? total - lastRemaining : 0,
      hourly_limit: total,
      daily_used: 0,
      daily_limit: 0,
      weekly_used: 0,
      weekly_limit: 0,
      estimated_cost_usd: 0.0,
    },
  });
}

// Listen for messages from the injected MAIN-world script
window.addEventListener('message', (ev) => {
  if (ev.source !== window || ev.data?.source !== 'observaai-claude') return;
  lastRemaining = ev.data.remaining;
  scheduleIngest();
});

// Fallback: scrape visible "X messages remaining" text in the UI
function scrapeDom() {
  const domSelectors = [
    '[data-testid="usage-remaining"]',
    '[data-testid="message-remaining"]',
    '[class*="remaining"]',
    '[class*="usageRemaining"]',
  ];
  for (const sel of domSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const m = el.textContent.match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n !== lastRemaining) {
        lastRemaining = n;
        scheduleIngest();
      }
      return;
    }
  }
}

const observer = new MutationObserver(scrapeDom);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
document.addEventListener('DOMContentLoaded', scrapeDom);
