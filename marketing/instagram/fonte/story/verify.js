// Confere o MP4 gerado: duração, tamanho e alguns quadros do próprio vídeo.
const fs = require('fs');
const path = require('path');
const { launch, serve } = require('./cdp');

(async () => {
  const dir = path.join(__dirname, '..', '..', 'stories');
  fs.writeFileSync(path.join(dir, '_verify.html'), '<!doctype html><body style="margin:0;background:#000"><video id="v" src="tendidesk-story.mp4" muted playsinline style="width:1080px;height:1920px;display:block"></video></body>');
  const server = await serve(dir, 8767);
  const b = await launch({ width: 1080, height: 1920, port: 9337 });
  try {
    await b.goto('http://127.0.0.1:8767/_verify.html');
    const info = await b.evaluate(`new Promise((resolve, reject) => { const v = document.getElementById('v'); const go = () => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }); if (v.readyState >= 1) go(); else { v.onloadedmetadata = go; v.onerror = () => reject(new Error('vídeo inválido')); } })`);
    console.log('info', JSON.stringify(info));
    for (const t of (process.argv[2] || '1.5,7.9,15.4').split(',').map(Number)) {
      // O Chrome sem janela não pinta vídeo na captura de tela: desenha o quadro decodificado num canvas.
      const data = await b.evaluate(`new Promise((resolve, reject) => { const v = document.getElementById('v'); v.onseeked = () => { const c = document.createElement('canvas'); c.width = 540; c.height = 960; c.getContext('2d').drawImage(v, 0, 0, 540, 960); resolve(c.toDataURL('image/jpeg', .85).split(',')[1]); }; v.onerror = () => reject(new Error('erro no vídeo')); v.currentTime = ${t}; })`);
      fs.writeFileSync(path.join(__dirname, `_check-${t}.jpg`), Buffer.from(data, 'base64'));
      console.log('quadro', t);
    }
  } finally {
    b.close(); server.close();
    fs.rmSync(path.join(dir, '_verify.html'), { force: true });
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
