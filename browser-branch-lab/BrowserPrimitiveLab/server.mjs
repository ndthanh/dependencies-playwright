import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createBranchHandler } from './branch-api.mjs';
import { localBranchStore } from './branch-store-local.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const branchHandler = createBranchHandler(localBranchStore(path.join(root,'.branch-data')));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const bound = (u, name, fallback, max) => {
  const raw = u.searchParams.get(name);
  const n = raw === null ? fallback : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`Invalid ${name}`);
  return n;
};
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    if(u.pathname.startsWith('/api/branch/')){const request=new Request(u,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});const response=await branchHandler(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
    if (u.pathname === '/api/health') return json(res, 200, { ok: true, app: 'browser-primitive-lab', version: 1 });
    if (u.pathname === '/api/download' && req.method === 'GET') {
      const delay = bound(u, 'delay', 0, 120);
      const duration = bound(u, 'duration', 0, 120);
      const kb = bound(u, 'kb', 64, 10240);
      await sleep(delay * 1000);
      if (res.destroyed) return;
      if (u.searchParams.get('fail') === '1') return json(res, 503, { error: 'Lỗi tải xuống chủ động (503)' });
      const content = Buffer.alloc(Math.max(1024, Math.round(kb * 1024)), 46);
      Buffer.from('AKABOT-LAB-DOWNLOAD\n').copy(content);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="lab-report.txt"', 'Content-Length': content.length, 'Cache-Control': 'no-store' });
      const chunks = duration ? 20 : 1;
      for (let i = 0; i < chunks; i++) {
        if (duration) await sleep(duration * 1000 / chunks);
        if (res.destroyed) return;
        res.write(content.subarray(Math.floor(i * content.length / chunks), Math.floor((i + 1) * content.length / chunks)));
        if (u.searchParams.get('abort') === '1' && i >= Math.floor(chunks / 2)) return res.destroy();
      }
      return res.end();
    }
    if (u.pathname === '/api/upload' && req.method === 'POST') {
      const duration = bound(u, 'duration', 0, 120);
      const delay = bound(u, 'delay', 0, 120);
      const length = Number(req.headers['content-length'] || 0);
      const max = 10 * 1024 * 1024;
      if (length > max) return json(res, 413, { error: 'Giới hạn 10 MB' });
      let received = 0;
      const hash = createHash('sha256');
      for await (const chunk of req) {
        received += chunk.length;
        if (received > max) return json(res, 413, { error: 'Giới hạn 10 MB' });
        hash.update(chunk);
        if (duration) await sleep(duration * 1000 * chunk.length / Math.max(length, received));
      }
      await sleep(delay * 1000);
      if (res.destroyed) return;
      if (u.searchParams.get('fail') === '1') return json(res, 503, { error: 'Lỗi xử lý upload chủ động (503)' });
      return json(res, 200, { name: decodeURIComponent(req.headers['x-file-name'] || 'file'), bytes: received, sha256: hash.digest('hex') });
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const files = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/frame': 'frame.html', '/popup': 'popup.html', '/favicon.svg': 'favicon.svg', '/login': 'login.html', '/login.js': 'login.js', '/branch':'branch.html', '/branch.js':'branch.js','/branch.css':'branch.css' };
    if (!files[u.pathname]) return json(res, 404, { error: 'Not found' });
    const f = files[u.pathname];
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': `${types[path.extname(f)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(await fs.readFile(path.join(root, 'public', f)));
  } catch (e) { if (!res.headersSent) json(res, 400, { error: e.message }); else res.destroy(); }
}).listen(port, '127.0.0.1', () => console.log(`Browser Primitive Lab: http://127.0.0.1:${port}`));
