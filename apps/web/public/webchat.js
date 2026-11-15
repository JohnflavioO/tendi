/*!
 * Widget de atendimento do TendiDesk. Cole no site:
 *   <script src="https://tendidesk.com.br/webchat.js" data-tendi-key="SUA_CHAVE" async></script>
 * Sem dependências. Fala só com as rotas /api/webchat/* do TendiDesk.
 * Fica dentro de um Shadow DOM: o CSS do site não muda o widget, e o do widget não mexe no site.
 */
(function () {
  'use strict';
  var scriptTag = document.currentScript;
  if (!scriptTag || window.__tendideskWebchat) return;
  window.__tendideskWebchat = true;
  var publicKey = scriptTag.getAttribute('data-tendi-key');
  if (!publicKey) { console.warn('[TendiDesk webchat] data-tendi-key não informado.'); return; }
  var origin = scriptTag.src.replace(/\/webchat\.js.*$/, '');
  var storageKey = 'tendi_webchat_token_' + publicKey;
  var teaserKey = 'tendi_webchat_teaser_' + publicKey;
  var POLL_OPEN_MS = 3000;
  var POLL_CLOSED_MS = 12000;
  var TYPING_TIMEOUT_MS = 45000;
  var TEASER_DELAY_MS = 5000;

  var state = { open: false, config: null, token: null, after: null, messages: [], sending: false, typingSince: 0, unread: 0, lastPoll: 0 };
  function readStore(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function writeStore(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* modo privado: segue sem guardar */ } }
  state.token = readStore(storageKey);

  function api(path, options) {
    return fetch(origin + path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body && body.error ? body.error : 'Falha na requisição.');
        return body;
      });
    });
  }

  function ensureSession() {
    if (state.token) return Promise.resolve();
    return api('/api/webchat/' + publicKey, { method: 'POST' }).then(function (data) {
      state.token = data.token;
      writeStore(storageKey, data.token);
    });
  }

  // ---------- cores ----------
  function parseHex(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amount) {
    var rgb = parseHex(hex) || [0, 71, 81];
    return 'rgb(' + rgb.map(function (c) { return Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c * amount : (255 - c) * amount)))); }).join(',') + ')';
  }
  function isLight(hex) {
    var rgb = parseHex(hex);
    if (!rgb) return false;
    return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 170;
  }

  // ---------- texto ----------
  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** *negrito* e links, como no WhatsApp. */
  function formatText(text) {
    return escapeHtml(text)
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[\s(])((?:www\.)?[a-z0-9-]+\.com\.br(?:\/[^\s<]*)?)/gi, '$1<a href="https://$2" target="_blank" rel="noopener noreferrer">$2</a>');
  }
  /** Opções numeradas no fim da mensagem ("1. Sim") viram botões. */
  function splitOptions(text) {
    var lines = String(text || '').split('\n');
    var options = [];
    while (lines.length && /^\s*\d\.\s+\S/.test(lines[lines.length - 1])) {
      options.unshift(lines.pop().replace(/^\s*\d\.\s+/, '').trim());
    }
    if (options.length < 2) return { text: text, options: [] };
    return { text: lines.join('\n').replace(/\s+$/, ''), options: options };
  }
  function clock(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function initials(name) {
    // "Duda · TendiDesk" → "D": usa só o nome antes do separador.
    var parts = String(name || 'A').split(/\s[·|•-]\s/)[0].trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || 'A')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  // ---------- ícones ----------
  var ICON_CHAT = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.9-.9L3 20.5l1.6-4.7A8.4 8.4 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" stroke-width="2.6"/></svg>';
  var ICON_DOWN = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // ---------- estrutura ----------
  var host = document.createElement('div');
  host.setAttribute('data-tendidesk-webchat', '');
  host.style.cssText = 'position:fixed;z-index:2147483000;bottom:0;right:0;width:0;height:0;';
  var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  shadow.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    '.w{--c:#004751;--c2:#00303a;--on:#fff;position:fixed;right:20px;bottom:20px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1E2046;-webkit-font-smoothing:antialiased;line-height:1.45;font-size:14px}' +
    '.launch{position:relative;display:grid;place-items:center;width:62px;height:62px;border:0;border-radius:22px;cursor:pointer;color:var(--on);background:linear-gradient(145deg,var(--c),var(--c2));box-shadow:0 14px 34px -10px rgba(16,18,52,.55),0 2px 6px rgba(16,18,52,.18);transition:transform .2s cubic-bezier(.2,.9,.3,1.3),border-radius .25s}' +
    '.launch:hover{transform:translateY(-2px) scale(1.04)}' +
    '.launch:active{transform:scale(.96)}' +
    '.launch:focus-visible,.x:focus-visible,.send:focus-visible,.opt:focus-visible,.tz:focus-visible{outline:3px solid #CB0A9F;outline-offset:3px}' +
    '.launch .ic{display:grid;place-items:center;transition:transform .25s,opacity .2s}' +
    '.launch .ic2{position:absolute;opacity:0;transform:rotate(-90deg)}' +
    '.w.open .launch{border-radius:50%}.w.open .launch .ic1{opacity:0;transform:rotate(90deg) scale(.6)}.w.open .launch .ic2{opacity:1;transform:none}' +
    '.badge{position:absolute;top:-6px;right:-6px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#CB0A9F;color:#fff;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;border:2px solid #fff}' +
    '.tz{position:absolute;right:0;bottom:76px;width:270px;padding:14px 38px 14px 14px;border-radius:18px 18px 6px 18px;background:#fff;box-shadow:0 18px 40px -14px rgba(16,18,52,.35),0 0 0 1px rgba(16,18,52,.06);display:none;gap:10px;align-items:flex-start;cursor:pointer;text-align:left;border:0;font:inherit;color:inherit;animation:up .35s cubic-bezier(.2,.9,.3,1.2)}' +
    '.tz.show{display:flex}.tz p{font-size:13px;color:#3A3D63}.tz b{display:block;font-size:13px;color:#1E2046;margin-bottom:2px}' +
    '.tzx{position:absolute;top:8px;right:8px;width:24px;height:24px;border:0;border-radius:8px;background:transparent;color:#9AA0BD;cursor:pointer;display:grid;place-items:center}.tzx:hover{background:#F1F2F8;color:#4A4E75}' +
    '.av{flex-shrink:0;width:38px;height:38px;border-radius:13px;display:grid;place-items:center;font-weight:800;font-size:14px;color:var(--on);background:linear-gradient(145deg,var(--c),var(--c2));position:relative}' +
    '.av i{position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:50%;background:#22C55E;border:2px solid #fff}' +
    '.p{position:absolute;right:0;bottom:78px;width:380px;height:min(620px,calc(100vh - 120px));display:none;flex-direction:column;overflow:hidden;border-radius:24px;background:#F6F7FB;box-shadow:0 30px 70px -20px rgba(16,18,52,.5),0 0 0 1px rgba(16,18,52,.06);transform-origin:bottom right;animation:pop .28s cubic-bezier(.2,.9,.3,1.15)}' +
    '.w.open .p{display:flex}' +
    '.h{position:relative;padding:18px 18px 22px;color:var(--on);background:radial-gradient(120% 140% at 0% 0%,rgba(255,255,255,.18),transparent 55%),linear-gradient(140deg,var(--c),var(--c2))}' +
    '.h .row{display:flex;align-items:center;gap:12px}.h .av{width:44px;height:44px;border-radius:15px;background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}.h .av i{border-color:var(--c)}' +
    '.h .t{flex:1;min-width:0}.h .n{font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.h .s{font-size:12px;opacity:.85;display:flex;align-items:center;gap:6px}' +
    '.x{width:36px;height:36px;border:0;border-radius:12px;display:grid;place-items:center;cursor:pointer;color:var(--on);background:rgba(255,255,255,.14)}.x:hover{background:rgba(255,255,255,.24)}' +
    '.l{flex:1;overflow-y:auto;padding:18px 14px 8px;display:flex;flex-direction:column;gap:4px;overscroll-behavior:contain;scrollbar-width:thin}' +
    '.g{display:flex;flex-direction:column;max-width:84%;animation:in .22s ease-out}.g.me{align-self:flex-end;align-items:flex-end}.g.them{align-self:flex-start}.g+.g{margin-top:8px}' +
    '.who{font-size:11px;font-weight:600;color:#6B6F93;margin:0 0 4px 4px}' +
    '.b{padding:10px 14px;border-radius:18px;font-size:14px;white-space:pre-wrap;word-break:break-word}' +
    '.them .b{background:#fff;color:#1E2046;border-top-left-radius:6px;box-shadow:0 1px 2px rgba(16,18,52,.06),0 0 0 1px rgba(16,18,52,.05)}' +
    '.me .b{background:linear-gradient(145deg,var(--c),var(--c2));color:var(--on);border-top-right-radius:6px}' +
    '.b a{color:inherit;text-decoration:underline;text-underline-offset:2px}.them .b a{color:var(--c)}' +
    '.b img{display:block;max-width:100%;border-radius:12px;margin:-4px -8px 6px}' +
    '.tm{font-size:10px;color:#9AA0BD;margin:3px 6px 0}' +
    '.opts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '.opt{border:1px solid var(--c);background:#fff;color:var(--c);border-radius:999px;padding:7px 13px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,color .15s}.opt:hover{background:var(--c);color:var(--on)}' +
    '.typing{align-self:flex-start;display:none;gap:4px;padding:13px 16px;margin-top:8px;background:#fff;border-radius:18px;border-top-left-radius:6px;box-shadow:0 0 0 1px rgba(16,18,52,.05)}.typing.show{display:flex}' +
    '.typing i{width:7px;height:7px;border-radius:50%;background:#A7ABC8;animation:dot 1.2s infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}' +
    '.err{display:none;margin:0 14px 6px;padding:8px 12px;border-radius:12px;background:#FEF0F0;color:#B42318;font-size:12px}' +
    '.f{padding:10px 12px 8px;background:#fff;border-top:1px solid #ECEEF5}' +
    '.box{display:flex;align-items:flex-end;gap:8px;padding:6px 6px 6px 14px;border-radius:18px;background:#F4F5FA;box-shadow:inset 0 0 0 1px #E4E6F0;transition:box-shadow .15s}.box:focus-within{box-shadow:inset 0 0 0 2px var(--c);background:#fff}' +
    'textarea{flex:1;min-height:24px;max-height:110px;padding:7px 0;border:0;outline:0;resize:none;background:transparent;font:inherit;font-size:15px;color:#1E2046}textarea::placeholder{color:#9AA0BD}' +
    '.send{flex-shrink:0;width:40px;height:40px;border:0;border-radius:14px;display:grid;place-items:center;cursor:pointer;color:var(--on);background:linear-gradient(145deg,var(--c),var(--c2));transition:opacity .15s,transform .15s}.send:disabled{opacity:.35;cursor:default}.send:not(:disabled):hover{transform:translateX(1px)}' +
    '.pw{display:block;text-align:center;font-size:10.5px;color:#A3A7C2;padding:7px 0 1px;text-decoration:none}.pw b{color:#6B6F93;font-weight:600}.pw:hover b{color:var(--c)}' +
    '@keyframes pop{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}' +
    '@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '@keyframes in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}' +
    '@keyframes dot{0%,60%,100%{transform:none;opacity:.5}30%{transform:translateY(-4px);opacity:1}}' +
    '@media (max-width:540px){.w{right:14px;bottom:14px}.w.open .launch{display:none}.p{position:fixed;inset:0;width:auto;height:auto;border-radius:0;padding-bottom:env(safe-area-inset-bottom)}.h{padding-top:calc(16px + env(safe-area-inset-top))}.tz{width:min(270px,calc(100vw - 28px))}}' +
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}' +
    '</style>' +
    '<div class="w" role="region" aria-label="Chat de atendimento">' +
    '  <div class="p" role="dialog" aria-modal="false" aria-labelledby="tdw-name">' +
    '    <div class="h"><div class="row"><div class="av" aria-hidden="true"><span class="ini">A</span><i></i></div><div class="t"><p class="n" id="tdw-name">Atendimento</p><p class="s">Online agora · responde em instantes</p></div><button class="x" type="button" aria-label="Fechar o chat">' + ICON_CLOSE + '</button></div></div>' +
    '    <div class="l" role="log" aria-live="polite"></div>' +
    '    <div class="err" role="alert"></div>' +
    '    <div class="f"><div class="box"><textarea rows="1" placeholder="Escreva sua mensagem…" aria-label="Escreva sua mensagem"></textarea><button class="send" type="button" aria-label="Enviar mensagem" disabled>' + ICON_SEND + '</button></div>' +
    '    <a class="pw" href="https://tendidesk.com.br" target="_blank" rel="noopener">Atendimento por <b>TendiDesk</b></a></div>' +
    '  </div>' +
    '  <button class="tz" type="button" aria-label="Abrir o chat"><div class="av" aria-hidden="true"><span class="ini">A</span><i></i></div><div><b class="tzn">Atendimento</b><p class="tzm"></p></div><span class="tzx" role="button" aria-label="Dispensar convite">' + ICON_CLOSE + '</span></button>' +
    '  <button class="launch" type="button" aria-label="Abrir o chat" aria-expanded="false"><span class="ic ic1">' + ICON_CHAT + '</span><span class="ic ic2">' + ICON_DOWN + '</span><span class="badge" aria-hidden="true"></span></button>' +
    '</div>';

  var $ = function (selector) { return shadow.querySelector(selector); };
  var wrap = $('.w');
  var list = $('.l');
  var input = $('textarea');
  var sendButton = $('.send');
  var launch = $('.launch');
  var teaser = $('.tz');
  wrap.style.display = 'none'; // só aparece depois que a configuração confirma que o widget está ligado

  // ---------- desenho das mensagens ----------
  function render() {
    var html = '';
    var name = (state.config && state.config.displayName) || 'Atendimento';
    if (state.config && state.config.greetingMessage && !state.messages.length) {
      html += '<div class="g them"><p class="who">' + escapeHtml(name) + '</p><div class="b">' + formatText(state.config.greetingMessage) + '</div></div>';
    }
    var lastSender = null;
    var lastOutboundIndex = -1;
    for (var k = state.messages.length - 1; k >= 0; k--) { if (state.messages[k].direction !== 'inbound') { lastOutboundIndex = k; break; } }
    var visitorAfter = lastOutboundIndex >= 0 && state.messages.slice(lastOutboundIndex + 1).some(function (m) { return m.direction === 'inbound'; });
    for (var i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      var mine = m.direction === 'inbound';
      var sender = mine ? 'me' : (m.senderName || name);
      var parts = mine ? { text: m.body, options: [] } : splitOptions(m.body);
      var body = '';
      if (m.mediaUrl) body += '<a href="' + escapeHtml(m.mediaUrl) + '" target="_blank" rel="noopener"><img src="' + escapeHtml(m.mediaUrl) + '" alt="' + escapeHtml(m.filename || 'Imagem enviada') + '"></a>';
      if (parts.text) body += formatText(parts.text);
      html += '<div class="g ' + (mine ? 'me' : 'them') + '">' +
        (!mine && sender !== lastSender ? '<p class="who">' + escapeHtml(sender) + '</p>' : '') +
        '<div class="b">' + body + '</div>';
      if (parts.options.length && i === lastOutboundIndex && !visitorAfter) {
        html += '<div class="opts">' + parts.options.map(function (option) { return '<button class="opt" type="button" data-opt="' + escapeHtml(option) + '">' + escapeHtml(option) + '</button>'; }).join('') + '</div>';
      }
      html += '<p class="tm">' + clock(m.createdAt) + '</p></div>';
      lastSender = sender;
    }
    html += '<div class="typing" aria-label="Digitando"><i></i><i></i><i></i></div>';
    list.innerHTML = html;
    updateTyping();
    list.scrollTop = list.scrollHeight;
  }

  function updateTyping() {
    var typing = list.querySelector('.typing');
    if (!typing) return;
    var waiting = state.typingSince && Date.now() - state.typingSince < TYPING_TIMEOUT_MS;
    typing.className = 'typing' + (waiting ? ' show' : '');
  }

  function setUnread(count) {
    state.unread = count;
    var badge = $('.badge');
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count ? 'flex' : 'none';
    launch.setAttribute('aria-label', count ? 'Abrir o chat (' + count + ' nova' + (count > 1 ? 's' : '') + ')' : (state.open ? 'Fechar o chat' : 'Abrir o chat'));
  }

  // ---------- rede ----------
  function poll() {
    if (!state.token) return;
    state.lastPoll = Date.now();
    var query = '?token=' + encodeURIComponent(state.token) + (state.after ? '&after=' + encodeURIComponent(state.after) : '');
    api('/api/webchat/messages' + query).then(function (data) {
      var incoming = (data.messages || []).filter(function (m) { return !state.messages.some(function (x) { return x.id === m.id; }); });
      if (!incoming.length) { updateTyping(); return; }
      state.messages = state.messages.concat(incoming);
      state.after = incoming[incoming.length - 1].createdAt;
      var replies = incoming.filter(function (m) { return m.direction !== 'inbound'; });
      if (replies.length) state.typingSince = 0;
      if (!state.open && replies.length) setUnread(state.unread + replies.length);
      render();
    }).catch(function (error) {
      // Sessão vencida ou apagada: começa outra na próxima mensagem.
      if (/sess|token/i.test(error.message || '')) { state.token = null; writeStore(storageKey, ''); }
    });
  }

  function send(textOverride) {
    var text = (typeof textOverride === 'string' ? textOverride : input.value).trim();
    if (!text || state.sending) return;
    state.sending = true;
    sendButton.disabled = true;
    $('.err').style.display = 'none';
    var post = function () {
      return ensureSession().then(function () {
        return api('/api/webchat/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: state.token, text: text }) });
      });
    };
    post().catch(function (error) {
      // Sessão vencida: abre outra e tenta de novo uma vez.
      if (!/sess/i.test(error.message || '')) throw error;
      state.token = null; state.after = null; state.messages = [];
      writeStore(storageKey, '');
      return post();
    }).then(function () {
      if (typeof textOverride !== 'string') { input.value = ''; autosize(); }
      state.typingSince = Date.now();
      poll();
    }).catch(function (error) {
      var box = $('.err');
      box.textContent = error.message || 'Não foi possível enviar. Tente de novo.';
      box.style.display = 'block';
    }).then(function () {
      state.sending = false;
      sendButton.disabled = !input.value.trim();
      if (state.open && window.matchMedia('(pointer:fine)').matches) input.focus();
    });
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    sendButton.disabled = !input.value.trim() || state.sending;
  }

  function hideTeaser(remember) {
    teaser.className = 'tz';
    if (remember) writeStore(teaserKey, '1');
  }

  function toggle(open) {
    state.open = open;
    wrap.className = 'w' + (open ? ' open' : '');
    launch.setAttribute('aria-expanded', open ? 'true' : 'false');
    hideTeaser(true);
    if (open) {
      setUnread(0);
      render();
      if (state.token) poll();
      if (window.matchMedia('(pointer:fine)').matches) setTimeout(function () { input.focus(); }, 60);
    } else {
      setUnread(state.unread);
    }
  }

  // ---------- eventos ----------
  launch.addEventListener('click', function () { toggle(!state.open); });
  $('.x').addEventListener('click', function () { toggle(false); launch.focus(); });
  teaser.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('.tzx')) { hideTeaser(true); return; }
    toggle(true);
  });
  sendButton.addEventListener('click', function () { send(); });
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
  });
  list.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('.opt');
    if (button) send(button.getAttribute('data-opt'));
  });
  shadow.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && state.open) { toggle(false); launch.focus(); }
  });

  // ---------- início ----------
  api('/api/webchat/' + publicKey).then(function (config) {
    state.config = config;
    var color = parseHex(config.color) ? config.color : '#004751';
    wrap.style.setProperty('--c', color);
    wrap.style.setProperty('--c2', shade(color, -0.35));
    wrap.style.setProperty('--on', isLight(color) ? '#1E2046' : '#FFFFFF');
    var name = config.displayName || 'Atendimento';
    $('#tdw-name').textContent = name;
    $('.tzn').textContent = name;
    var shortGreeting = String(config.greetingMessage || 'Olá! Como podemos ajudar?');
    $('.tzm').textContent = shortGreeting.length > 90 ? shortGreeting.slice(0, 88).trim() + '…' : shortGreeting;
    Array.prototype.forEach.call(shadow.querySelectorAll('.ini'), function (el) { el.textContent = initials(name); });
    document.body.appendChild(host);
    wrap.style.display = '';
    render();
    if (state.token) poll();
    if (!readStore(teaserKey) && !state.token) {
      setTimeout(function () { if (!state.open) teaser.className = 'tz show'; }, TEASER_DELAY_MS);
    }
  }).catch(function () { /* widget desligado ou chave inválida: não mostra nada */ });

  setInterval(function () {
    if (!state.config) return;
    if (Date.now() - state.lastPoll >= (state.open ? POLL_OPEN_MS : POLL_CLOSED_MS)) poll();
    else updateTyping();
  }, 1000);
})();
