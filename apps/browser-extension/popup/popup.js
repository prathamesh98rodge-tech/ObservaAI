const DEFAULT_GATEWAY = 'http://localhost:8000';
const PROVIDERS = ['claude', 'openai', 'gemini'];

function msAgo(ms) {
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

async function init() {
  const { gatewayUrl = DEFAULT_GATEWAY, lastIngest = {} } =
    await chrome.storage.local.get(['gatewayUrl', 'lastIngest']);

  // Show gateway hostname in footer
  try {
    const u = new URL(gatewayUrl);
    document.getElementById('gw-label').textContent = u.host;
  } catch {
    document.getElementById('gw-label').textContent = gatewayUrl;
  }

  // Connectivity check
  const dot = document.getElementById('gw-dot');
  try {
    const r = await fetch(`${gatewayUrl}/health`, { signal: AbortSignal.timeout(2000) });
    dot.className = `dot ${r.ok ? 'dot-green' : 'dot-red'}`;
  } catch {
    dot.className = 'dot dot-red';
  }

  // Build provider rows
  const tbody = document.getElementById('providers');
  tbody.innerHTML = '';
  for (const p of PROVIDERS) {
    const info = lastIngest[p];
    let statusHtml;
    if (!info) {
      statusHtml = '<span class="never">No data yet</span>';
    } else if (info.ok) {
      statusHtml = `<span class="ok">Synced ${msAgo(Date.now() - info.ts)}</span>`;
    } else {
      statusHtml = `<span class="err">Error ${info.httpStatus ?? ''}</span>`;
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p}</td><td>${statusHtml}</td>`;
    tbody.appendChild(tr);
  }
}

document.getElementById('options-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
