/**
 * ObservaAI Companion — ChatGPT content script
 *
 * ChatGPT shows remaining message counts in various places:
 *   - Composer subtitle: "7 GPT-4o messages left until <time>"
 *   - Usage bar near the model selector
 *   - "You've reached your GPT-4 limit" banners
 *
 * Strategy: MutationObserver + text pattern matching across likely DOM nodes.
 * Debounced 5 s before POSTing to the gateway via background.js.
 */

let debounceTimer = null;
let lastUsed = null;
let lastLimit = null;

function parseUsageText(text) {
  // "7 of 50 messages left" or "7/50"
  let m = text.match(/(\d+)\s+(?:of|\/)\s*(\d+)\s+(?:GPT|messages?)/i);
  if (m) return { used: parseInt(m[2], 10) - parseInt(m[1], 10), limit: parseInt(m[2], 10) };

  // "7 GPT-4o messages left until..."
  m = text.match(/(\d+)\s+(?:GPT[-\w]*\s+)?messages?\s+(?:remaining|left)/i);
  if (m) return { remaining: parseInt(m[1], 10) };

  // "You've reached your X message limit" — treat as 0 remaining
  if (/reached your.*limit/i.test(text)) return { remaining: 0 };

  return null;
}

function scrape() {
  // Prioritise specific test IDs, fall through to text scan
  const prioritySelectors = [
    '[data-testid="composer-subtitle"]',
    '[data-testid*="usage"]',
    '[data-testid*="limit"]',
    '[class*="usageBar"]',
    '[class*="rateLimit"]',
    '[class*="messageLimit"]',
  ];

  const candidates = [
    ...prioritySelectors.flatMap(s => [...document.querySelectorAll(s)]),
    ...document.querySelectorAll('p, span, div, button'),
  ];

  for (const el of candidates) {
    const text = el.textContent?.trim();
    if (!text || text.length > 200) continue;

    const parsed = parseUsageText(text);
    if (!parsed) continue;

    const limit = parsed.limit ?? lastLimit ?? 0;
    const used = parsed.used ?? (limit > 0 && parsed.remaining !== undefined
      ? limit - parsed.remaining
      : parsed.remaining !== undefined ? 0 : null);

    if (used === null) continue;

    if (used !== lastUsed || limit !== lastLimit) {
      lastUsed = used;
      lastLimit = limit;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'OBSERVAAI_USAGE',
          payload: {
            provider: 'openai',
            plan: 'Plus',
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
setTimeout(scrape, 2000); // retry after hydration
