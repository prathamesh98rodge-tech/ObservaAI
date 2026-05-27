/**
 * ObservaAI Companion — Gemini content script
 *
 * Gemini Pro shows rate-limit notices when nearing limits. The exact DOM
 * structure is less documented, so we use a broad text-scan with MutationObserver
 * and a periodic fallback poll.
 *
 * Debounced 5 s before POSTing to the gateway via background.js.
 */

let debounceTimer = null;
let pollTimer = null;
let lastUsed = null;
let lastLimit = null;

function parseUsageText(text) {
  let m;

  // "5 of 50 messages remaining" / "5/50"
  m = text.match(/(\d+)\s+(?:of|\/)\s*(\d+)\s+(?:messages?|conversations?|requests?)/i);
  if (m) return { used: parseInt(m[2], 10) - parseInt(m[1], 10), limit: parseInt(m[2], 10) };

  // "5 messages remaining / left"
  m = text.match(/(\d+)\s+(?:messages?|conversations?)\s+(?:remaining|left)/i);
  if (m) return { remaining: parseInt(m[1], 10) };

  // "You have reached your limit" — 0 remaining
  if (/reached.*limit|limit.*reached/i.test(text)) return { remaining: 0 };

  return null;
}

function scrape() {
  const prioritySelectors = [
    '[data-testid*="usage"]',
    '[aria-label*="usage"]',
    '[aria-label*="limit"]',
    '[class*="usageLimit"]',
    '[class*="rateLimit"]',
    '[class*="messageLimit"]',
    'mat-progress-bar',
  ];

  const candidates = [
    ...prioritySelectors.flatMap(s => [...document.querySelectorAll(s)]),
    ...document.querySelectorAll('p, span, div'),
  ];

  for (const el of candidates) {
    const text = el.textContent?.trim();
    if (!text || text.length > 200) continue;

    const parsed = parseUsageText(text);
    if (!parsed) continue;

    const limit = parsed.limit ?? lastLimit ?? 0;
    const used = parsed.used ?? (parsed.remaining !== undefined && limit > 0
      ? limit - parsed.remaining
      : 0);

    if (used !== lastUsed || limit !== lastLimit) {
      lastUsed = used;
      lastLimit = limit;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'OBSERVAAI_USAGE',
          payload: {
            provider: 'gemini',
            plan: 'Pro',
            hourly_used: used,
            hourly_limit: limit,
            daily_used: 0,
            daily_limit: 0,
            weekly_used: 0,
            weekly_limit: 0,
            estimated_cost_usd: 0.0,
          },
        });
      }, 5000);
    }
    return;
  }
}

const observer = new MutationObserver(scrape);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

document.addEventListener('DOMContentLoaded', scrape);

// Periodic fallback: Gemini is a heavy SPA — some elements render late
function startPoll() {
  scrape();
  pollTimer = setInterval(scrape, 30_000);
}
setTimeout(startPoll, 3000);
