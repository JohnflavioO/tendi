// Controle mínimo do Chrome pelo DevTools Protocol (sem dependências; Node 22+ tem WebSocket nativo).
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let body = ''; res.on('data', c => (body += c)); res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } }); }).on('error', reject);
  });
}

async function launch({ width = 1080, height = 1920, port = 9333 } = {}) {
  if (!CHROME) throw new Error('Chrome ou Edge não encontrado.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tendidesk-story-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 60 && !version; i++) {
    await new Promise(r => setTimeout(r, 250));
    version = await getJson(`http://127.0.0.1:${port}/json/version`).catch(() => null);
  }
  if (!version) throw new Error('Chrome não respondeu.');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      listeners.forEach(fn => fn(msg));
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const message = { id: ++id, method, params };
    if (sessionId) message.sessionId = sessionId;
    pending.set(message.id, { resolve, reject });
    ws.send(JSON.stringify(message));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page('Page.enable');
  await page('Runtime.enable');
  await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const waitFor = (method, timeout = 30000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), timeout);
    const fn = msg => { if (msg.method === method && msg.sessionId === sessionId) { clearTimeout(timer); listeners.splice(listeners.indexOf(fn), 1); resolve(msg.params); } };
    listeners.push(fn);
  });
  const evaluate = async (expression, awaitPromise = true) => {
    const result = await page('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const goto = async url => { const loaded = waitFor('Page.loadEventFired'); await page('Page.navigate', { url }); await loaded; };
  const close = () => { try { ws.close(); } catch {} proc.kill(); };
  return { page, evaluate, goto, close };
}

/** Servidor local simples (mesma origem para páginas e imagens: o canvas pode ser gravado). */
function serve(dir, port = 8765) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { launch, serve };
