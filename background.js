chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: 'welcome.html' });
});

// Fetches run here because PR .diff redirects to patch-diff.githubusercontent.com, which has no CORS for page scripts.
chrome.runtime.onMessage.addListener((url, sender, reply) => {
  if (typeof url !== 'string' || !url.startsWith('https://github.com/')) return reply({ error: 'bad url' });
  fetch(url, { credentials: 'include' })
    .then(r => (r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`)))
    .then(text => reply({ text }), err => reply({ error: String(err) }));
  return true;
});
