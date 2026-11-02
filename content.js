// lines: text split on '\n', each still carrying its '\r' if it had one
function ending(lines) {
  let crlf = 0, lf = 0;
  for (const l of lines) l.endsWith('\r') ? crlf++ : lf++;
  return crlf && lf ? `Mixed (${crlf} CRLF, ${lf} LF)` : crlf ? 'CRLF' : lf ? 'LF' : 'none';
}

// Git's own test: a NUL in the first 8000 bytes means binary (images, PDFs, docx/xlsx zips, ...).
// shortcut: the file is still downloaded before this check; skip known extensions up front if huge files get slow.
const isBinary = t => t.slice(0, 8000).includes('\0');

// Returns [[path, ending]] judged from the added and context lines of each file in a unified diff.
// shortcut: only sees lines shown in the diff, not whole files; fetch each file at the PR head if full-file results are needed.
function parseDiff(diff) {
  const files = [];
  let cur = null, pushed = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) cur = null;
    // git quotes names with special characters: +++ "b/\303\244.txt"
    else if (!cur && /^\+\+\+ "?b\//.test(line)) files.push(cur = { name: line.replace(/^\+\+\+ "?b\/|"$/g, ''), lines: [], hunk: false });
    else if (cur && line.startsWith('@@')) cur.hunk = true;
    else if (cur?.hunk && (line[0] === '+' || line[0] === ' ')) { cur.lines.push(line); pushed = true; continue; }
    // "\ No newline at end of file": the line before it had no line break at all
    else if (cur?.hunk && line[0] === '\\' && pushed) cur.lines.pop();
    pushed = false;
  }
  return files.map(f => [f.name, ending(f.lines)]).filter(([, e]) => e !== 'none');
}

const box = document.createElement('div');
Object.assign(box.style, {
  // Long PR file lists scroll inside the box instead of covering the page.
  position: 'fixed', bottom: '12px', right: '12px', zIndex: 1000, maxHeight: '40vh', maxWidth: '50vw', overflow: 'auto',
  background: '#24292f', color: '#fff', font: '12px monospace', padding: '6px 10px', borderRadius: '6px', whiteSpace: 'pre',
});
let last = '', text = '', fetched = '', fetchedAt = 0;

async function run() {
  last = location.pathname;
  const p = location.pathname.split('/'); // ['', owner, repo, kind, ...]
  let url, render;
  if (p[3] === 'blob' && p.length > 5) {
    p[3] = 'raw';
    url = p.join('/');
    render = t => isBinary(t) ? '' : 'Line endings: ' + ending(t.split('\n').slice(0, -1)).replace('none', 'no line breaks');
  } else if (p[3] === 'pull' && /^\d+$/.test(p[4])) {
    url = `/${p[1]}/${p[2]}/pull/${p[4]}.diff`;
    render = t => {
      const files = parseDiff(t), tally = {};
      if (!files.length) return '';
      for (const [, e] of files) { const k = e.split(' ')[0]; tally[k] = (tally[k] || 0) + 1; }
      return `Line endings in diff: ${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(', ')}\n`
        + files.map(([n, e]) => `${e.padEnd(4)}  ${n}`).join('\n');
    };
  } else { text = fetched = ''; box.remove(); return; }
  // PR tabs (/pull/5, /pull/5/files, ...) share one diff: reuse the last good result for a minute,
  // so commits pushed meanwhile still show up.
  if (url === fetched && Date.now() - fetchedAt < 60000) return void (text && document.body.append(box));
  text = fetched = ''; box.remove();
  const href = last;
  const res = await chrome.runtime.sendMessage('https://github.com' + url);
  if (href !== location.pathname) return; // user navigated away meanwhile
  text = res.error ? 'Line endings: ' + res.error : render(res.text);
  if (!res.error) { fetched = url; fetchedAt = Date.now(); } // errors retry on the next navigation
  show(text);
  if (text) document.body.append(box);
}

// Multi-line results go in a native <details> so the user can minimize them to the summary line.
let open = true; // kept while browsing in this tab
function show(t) {
  const [head, ...rest] = t.split('\n');
  if (!rest.length) return void (box.textContent = t);
  const d = document.createElement('details'), s = document.createElement('summary');
  s.textContent = head;
  s.style.cursor = 'pointer';
  d.append(s, rest.join('\n'));
  d.open = open;
  d.ontoggle = () => { open = d.open; };
  box.replaceChildren(d);
}

// GitHub navigates without page loads and may swap <body>, so poll the path and re-attach the box.
// Path only: #L10 or #diff-... anchors change on every click and must not refetch.
setInterval(() => {
  if (location.pathname !== last) run();
  else if (text && !box.isConnected) document.body.append(box);
}, 1000);
