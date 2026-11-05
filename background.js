chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: 'welcome.html' });
});

// GitHub Enterprise lives on any domain, so the user enables each one by clicking the toolbar icon there.
// *.host also covers the raw./media. subdomains Enterprise redirects file downloads to.
chrome.action.onClicked.addListener(tab => {
  const { protocol, hostname, origin } = new URL(tab.url);
  if (protocol !== 'https:' || hostname === 'github.com') return;
  // request() must be the first async call so it still counts as the user's click
  chrome.permissions.request({ origins: [`https://*.${hostname}/*`] }).then(async granted => {
    if (!granted) return;
    await chrome.scripting.registerContentScripts([{ id: hostname, matches: [`${origin}/*`], js: ['content.js'] }])
      .catch(() => {}); // already registered on an earlier click
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
  });
});

// Fetches run here because PR .diff redirects to patch-diff.githubusercontent.com, which has no CORS for page scripts.
chrome.runtime.onMessage.addListener((url, sender, reply) => {
  // Only same-site downloads, so a page can't use the extension to read other sites.
  if (typeof url !== 'string' || !url.startsWith(sender.origin + '/')) return reply({ error: 'bad url' });
  fetch(url, { credentials: 'include' })
    .then(r => (r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`)))
    .then(text => reply({ text }), err => reply({ error: String(err) }));
  return true;
});
