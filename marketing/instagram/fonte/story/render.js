// Gera o story do TendiDesk.
//   node render.js previa 1.2,4.5,7.9   -> PNGs de alguns instantes (para revisar)
//   node render.js video                -> marketing/instagram/stories/tendidesk-story.mp4 (1080x1920, 30 fps)
// Usa só o Chrome instalado: quadros pelo DevTools Protocol e o MP4 (H.264) pelo WebCodecs do navegador,
// quadro a quadro (não depende de tempo real). verify.js confere duração e tamanho do arquivo final.
const fs = require('fs');
const path = require('path');
const { launch, serve } = require('./cdp');

const DIR = __dirname;
const OUT_DIR = path.join(DIR, '..', '..', 'stories');
const FPS = 30;

async function main() {
  const [mode = 'previa', times = '1.3,4.4,7.9,10.3,12.8,15.5'] = process.argv.slice(2);
  fs.copyFileSync(path.join(DIR, '..', '..', '..', '..', 'apps', 'web', 'public', 'brand', 'tendidesk-logo-branca.png'), path.join(DIR, 'logo-branca.png'));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = await serve(DIR, 8765);
  const browser = await launch({ width: 1080, height: 1920, port: 9335 });
  try {
    await browser.goto('http://127.0.0.1:8765/story.html');
    // As fontes só baixam quando aparecem na tela: carrega todas antes (senão o 1º quadro de cada título sai sem texto).
    await browser.evaluate(`Promise.all([
      '900 italic 100px Montserrat', '800 italic 34px Montserrat',
      '400 30px Inter', '500 30px Inter', '600 30px Inter', '700 30px Inter', '800 30px Inter',
    ].map(font => document.fonts.load(font))).then(() => document.fonts.ready).then(() => new Promise(r => setTimeout(r, 400)))`);
    const shot = async t => {
      // Espera o navegador pintar dois quadros depois de posicionar a animação (sem isso, partes saíam em branco).
      await browser.evaluate(`seek(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      const { data } = await browser.page('Page.captureScreenshot', { format: 'jpeg', quality: 93, captureBeyondViewport: false });
      return data;
    };

    if (mode === 'previa') {
      for (const t of times.split(',').map(Number)) {
        const file = path.join(OUT_DIR, `previa-${String(t).replace('.', '_')}s.jpg`);
        fs.writeFileSync(file, Buffer.from(await shot(t), 'base64'));
        console.log('ok', path.basename(file));
      }
      return;
    }

    // 1) quadros
    const framesDir = path.join(DIR, 'frames');
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir);
    const duration = await browser.evaluate('window.DURATION');
    const total = Math.round(duration * FPS);
    for (let i = 0; i < total; i++) {
      fs.writeFileSync(path.join(framesDir, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(await shot(i / FPS), 'base64'));
      if (i % 60 === 0) console.log(`quadro ${i}/${total}`);
    }

    // 2) vídeo: o navegador codifica os quadros em H.264 e monta o MP4 (encoder.html)
    await browser.goto(`http://127.0.0.1:8765/encoder.html?n=${total}&fps=${FPS}`);
    const base64 = await browser.evaluate('record()');
    const file = path.join(OUT_DIR, 'tendidesk-story.mp4');
    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    console.log('vídeo', file, Math.round(fs.statSync(file).size / 1024), 'KB');
    if (!process.env.KEEP_FRAMES) fs.rmSync(framesDir, { recursive: true, force: true });
  } finally {
    browser.close();
    server.close();
  }
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
