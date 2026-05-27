/**
 * ObservaAI Companion — background service worker
 * Receives OBSERVAAI_USAGE messages from content scripts and POSTs to gateway.
 */

const DEFAULT_GATEWAY = 'http://localhost:8000';

async function ingest(payload) {
  const { gatewayUrl = DEFAULT_GATEWAY } = await chrome.storage.local.get('gatewayUrl');
  const res = await fetch(`${gatewayUrl}/subscriptions/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const { lastIngest = {} } = await chrome.storage.local.get('lastIngest');
  lastIngest[payload.provider] = { ts: Date.now(), ok: res.ok, httpStatus: res.status };
  await chrome.storage.local.set({ lastIngest });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'OBSERVAAI_USAGE') {
    ingest(msg.payload)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, err: err.message }));
    return true; // keep channel open for async response
  }

  if (msg.type === 'GET_STATUS') {
    chrome.storage.local.get('lastIngest', ({ lastIngest = {} }) => {
      sendResponse(lastIngest);
    });
    return true;
  }
});
