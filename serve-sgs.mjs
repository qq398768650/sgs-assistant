// 三国杀助手 userscript 本地托管：给 Tampermonkey 提供安装 / 自动更新源
// 每次请求都重新读盘，保证 @updateURL 检查时拿到的是最新版本。
// 头部的 GitHub raw 地址会被改写成 http://127.0.0.1:PORT，@require 的数据文件也从本地取。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8100;
const HOST = '127.0.0.1';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = 'sgs-assistant.user.js';
const FILE = path.join(DIR, SCRIPT);
const RAW = 'https://raw.githubusercontent.com/qq398768650/sgs-assistant/main';
const LOCAL = `http://${HOST}:${PORT}`;

const FILES = {
  '/data/game-data.js': path.join(DIR, 'data', 'game-data.js'),
  '/data/rogue-fights.js': path.join(DIR, 'data', 'rogue-fights.js'),
};

function readMeta(src) {
  const get = (k) => {
    const m = src.match(new RegExp('^//\\s*@' + k + '\\s+(.+)$', 'm'));
    return m ? m[1].trim() : '';
  };
  return {
    name: get('name'), version: get('version'), description: get('description'),
    author: get('author'), updateURL: get('updateURL'), downloadURL: get('downloadURL'),
  };
}

// 把脚本头部所有 GitHub raw 地址换成本地地址（updateURL / downloadURL / require 全覆盖）
function localize(src) {
  return src.split(RAW).join(LOCAL);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(meta, st, lines) {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>三国杀助手 · 脚本托管</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(circle at 30% 20%,#241a12,#0a0d11 70%);color:#e8dcc6;
    font:14px/1.7 "Microsoft YaHei",system-ui,sans-serif}
  .card{width:min(640px,92vw);background:linear-gradient(180deg,rgba(32,25,20,.96),rgba(16,13,11,.96));
    border:1px solid rgba(200,164,92,.36);border-radius:14px;padding:30px 34px;
    box-shadow:0 24px 70px rgba(0,0,0,.72)}
  h1{margin:0 0 4px;font-size:19px;color:#d8b871;letter-spacing:.6px}
  .sub{color:#8b7c62;font-size:12px;margin-bottom:22px}
  .kv{display:grid;grid-template-columns:88px 1fr;gap:5px 14px;font-size:12.5px;
    padding:14px 16px;background:rgba(0,0,0,.3);border-radius:9px;margin-bottom:22px}
  .kv b{color:#9c8a6a;font-weight:400}
  .kv span{color:#e8dcc6;word-break:break-all;font-family:ui-monospace,Consolas,monospace;font-size:12px}
  a.go{display:block;text-align:center;text-decoration:none;padding:14px;border-radius:9px;
    background:linear-gradient(90deg,#c8a45c,#a8842f);color:#1a140e;font-weight:700;font-size:15px;
    letter-spacing:1px;box-shadow:0 8px 24px rgba(200,164,92,.28);transition:.15s}
  a.go:hover{transform:translateY(-1px);box-shadow:0 12px 30px rgba(200,164,92,.42)}
  .note{margin-top:20px;font-size:11.5px;color:#7d6e56;line-height:1.85}
  .note code{background:rgba(255,255,255,.07);padding:1.5px 6px;border-radius:4px;
    color:#d8b871;font-family:ui-monospace,Consolas,monospace}
  .alt{margin-top:16px;font-size:11.5px}
  .alt a{color:#7fb0d8;text-decoration:none}
</style></head><body>
<div class="card">
  <h1>${esc(meta.name || '三国杀助手')}</h1>
  <div class="sub">本地 userscript 托管源 · Tampermonkey 安装与自动更新</div>
  <div class="kv">
    <b>版本</b><span>${esc(meta.version)}</span>
    <b>作者</b><span>${esc(meta.author)}</span>
    <b>文件</b><span>${SCRIPT}</span>
    <b>规模</b><span>${lines} 行 · ${(st.size / 1024).toFixed(1)} KB</span>
    <b>更新时间</b><span>${esc(st.mtime.toLocaleString('zh-CN'))}</span>
    <b>更新源</b><span>${esc(meta.updateURL)}</span>
  </div>
  <a class="go" href="/${SCRIPT}">安装 / 更新到 Tampermonkey</a>
  <div class="note">
    点击后浏览器跳转到脚本地址，Tampermonkey 会拦截并弹出安装页。<br>
    若没弹出，确认扩展已启用，或直接访问 <code>${LOCAL}/${SCRIPT}</code>。<br>
    本页已把脚本里的 <code>@updateURL</code> / <code>@require</code> 改成本地地址，
    装好后点「检查更新」即可拉到本机最新版本。
  </div>
  <div class="alt"><a href="/${SCRIPT}?view=1">查看脚本源码</a> · <a href="/status">JSON 状态</a></div>
</div>
</body></html>`;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${HOST}:${PORT}`);

  const send = (code, type, body, extra) => {
    const headers = Object.assign({
      'Content-Type': type,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
    }, extra || {});
    headers['Content-Length'] = Buffer.byteLength(body);
    res.writeHead(code, headers);
    if (req.method === 'HEAD') res.end();
    else res.end(body);
  };

  // 静态数据文件（@require 从这里取）
  if (FILES[u.pathname]) {
    try {
      const buf = fs.readFileSync(FILES[u.pathname]);
      send(200, 'text/javascript; charset=utf-8', buf);
    } catch (_) {
      send(404, 'text/plain; charset=utf-8', 'not found');
    }
    return;
  }

  let src = '';
  let stat = null;
  try { src = fs.readFileSync(FILE, 'utf8'); stat = fs.statSync(FILE); } catch (_) {}

  if (u.pathname === '/' || u.pathname === '/index.html') {
    if (!stat) { send(500, 'text/plain; charset=utf-8', '脚本文件缺失: ' + FILE); return; }
    send(200, 'text/html; charset=utf-8', page(readMeta(src), stat, src.split('\n').length));
    return;
  }

  if (u.pathname === '/' + SCRIPT) {
    if (!stat) { send(404, 'text/plain; charset=utf-8', 'not found'); return; }
    const out = localize(src);
    send(200, 'text/javascript; charset=utf-8', out, { 'X-Script-Version': readMeta(src).version });
    return;
  }

  if (u.pathname === '/status') {
    if (!stat) { send(404, 'application/json', JSON.stringify({ ok: false })); return; }
    send(200, 'application/json; charset=utf-8', JSON.stringify({
      ok: true, ...readMeta(src), local: LOCAL,
      lines: src.split('\n').length, bytes: stat.size, mtime: stat.mtime,
    }, null, 2));
    return;
  }

  send(404, 'text/plain; charset=utf-8', 'not found');
});

server.on('error', (e) => {
  console.error('SERVER ERROR:', e.code || e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const meta = (() => { try { return readMeta(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } })();
  console.log(`[sgs-assistant-host] listening  ${LOCAL}/`);
  console.log(`[sgs-assistant-host] install    ${LOCAL}/${SCRIPT}`);
  console.log(`[sgs-assistant-host] serving    ${FILE}  v${meta.version}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500); });
}
