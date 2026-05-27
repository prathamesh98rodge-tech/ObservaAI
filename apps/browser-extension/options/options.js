const DEFAULT_GATEWAY = 'http://localhost:8000';

async function init() {
  const { gatewayUrl = DEFAULT_GATEWAY } = await chrome.storage.local.get('gatewayUrl');
  document.getElementById('gateway').value = gatewayUrl;
}

document.getElementById('save').addEventListener('click', async () => {
  const raw = document.getElementById('gateway').value.trim().replace(/\/$/, '');
  const url = raw || DEFAULT_GATEWAY;
  await chrome.storage.local.set({ gatewayUrl: url });

  const notice = document.getElementById('saved');
  notice.style.display = 'block';
  setTimeout(() => { notice.style.display = 'none'; }, 2000);
});

init();
