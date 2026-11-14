/*!
 * Widget de atendimento do Tendi. Cole no site:
 *   <script src="https://SEU-APP/webchat.js" data-tendi-key="SUA_CHAVE" async></script>
 * Sem dependências. Fala só com as rotas /api/webchat/* do Tendi.
 */
(function () {
  'use strict';
  var scriptTag = document.currentScript;
  if (!scriptTag) return;
  var publicKey = scriptTag.getAttribute('data-tendi-key');
  if (!publicKey) { console.warn('[Tendi webchat] data-tendi-key não informado.'); return; }
  var origin = scriptTag.src.replace(/\/webchat\.js.*$/, '');
  var storageKey = 'tendi_webchat_token_' + publicKey;
  var POLL_MS = 4000;

  var state = { open: false, config: null, token: null, conversationId: null, after: null, messages: [], sending: false };
  try { state.token = window.localStorage.getItem(storageKey); } catch (e) { /* localStorage indisponível (modo privado) */ }

  function api(path, options) {
    return fetch(origin + path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body && body.error ? body.error : 'Falha na requisição.');
        return body;
      });
    });
  }

  function saveToken(token) {
    state.token = token;
    try { window.localStorage.setItem(storageKey, token); } catch (e) { /* segue sem guardar: pede de novo na próxima visita */ }
  }

  function ensureSession() {
    if (state.token && state.conversationId) return Promise.resolve();
    if (state.token) return Promise.resolve(); // token salvo: a 1ª busca de mensagens confirma se ainda vale
    return api('/api/webchat/' + publicKey, { method: 'POST' }).then(function (data) {
      saveToken(data.token);
      state.conversationId = data.conversationId;
    });
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : text;
    return div.innerHTML;
  }

  function render() {
    var list = root.querySelector('.tdw-list');
    if (!list) return;
    var html = '';
    if (state.config && state.config.greetingMessage && state.messages.length === 0) {
      html += '<div class="tdw-msg tdw-in">' + escapeHtml(state.config.greetingMessage) + '</div>';
    }
    for (var i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      var side = m.direction === 'inbound' ? 'tdw-out' : 'tdw-in';
      var body = '';
      if (m.mediaUrl) body += '<a href="' + m.mediaUrl + '" target="_blank" rel="noopener"><img src="' + m.mediaUrl + '" alt="' + escapeHtml(m.filename || 'imagem') + '" class="tdw-img" onerror="this.replaceWith(document.createTextNode(\'' + escapeHtml(m.filename || 'Arquivo enviado') + '\'))"/></a>';
      if (m.body) body += '<div>' + escapeHtml(m.body) + '</div>';
      html += '<div class="tdw-msg ' + side + '">' + body + '</div>';
    }
    list.innerHTML = html;
    list.scrollTop = list.scrollHeight;
  }

  function poll() {
    if (!state.token) return;
    var query = '?token=' + encodeURIComponent(state.token) + (state.after ? '&after=' + encodeURIComponent(state.after) : '');
    api('/api/webchat/messages' + query).then(function (data) {
      var incoming = data.messages || [];
      if (incoming.length) {
        state.messages = state.messages.concat(incoming);
        state.after = incoming[incoming.length - 1].createdAt;
        if (!state.open) root.querySelector('.tdw-dot').style.display = 'block';
        render();
      }
    }).catch(function () { /* próxima rodada tenta de novo */ });
  }

  function send() {
    var input = root.querySelector('.tdw-input');
    var text = input.value.trim();
    if (!text || state.sending) return;
    state.sending = true;
    input.disabled = true;
    ensureSession().then(function () {
      return api('/api/webchat/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: state.token, text: text }) });
    }).then(function () {
      input.value = '';
      poll(); // busca a mensagem recém-enviada já com o id definitivo, sem esperar o próximo ciclo
    }).catch(function (error) {
      var errorBox = root.querySelector('.tdw-error');
      errorBox.textContent = error.message || 'Não foi possível enviar. Tente de novo.';
      errorBox.style.display = 'block';
    }).finally(function () {
      state.sending = false;
      input.disabled = false;
      input.focus();
    });
  }

  function toggle(open) {
    state.open = open;
    root.querySelector('.tdw-panel').style.display = open ? 'flex' : 'none';
    root.querySelector('.tdw-dot').style.display = 'none';
    if (open) { ensureSession().then(poll); render(); }
  }

  var style = document.createElement('style');
  style.textContent =
    '.tdw-root{position:fixed;bottom:20px;right:20px;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
    '.tdw-bubble{position:relative;width:60px;height:60px;border-radius:999px;border:0;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.2);color:#fff;font-size:26px}' +
    '.tdw-dot{display:none;position:absolute;top:2px;right:2px;width:12px;height:12px;border-radius:999px;background:#CB0A9F;border:2px solid #fff}' +
    '.tdw-panel{display:none;flex-direction:column;position:fixed;bottom:92px;right:20px;width:340px;max-width:calc(100vw - 32px);height:460px;max-height:calc(100vh - 140px);background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.22);overflow:hidden}' +
    '.tdw-head{color:#fff;padding:14px 16px;font-weight:700;font-size:14px;display:flex;justify-content:space-between;align-items:center}' +
    '.tdw-close{background:none;border:0;color:#fff;font-size:18px;cursor:pointer;opacity:.85}' +
    '.tdw-list{flex:1;overflow-y:auto;padding:12px;background:#F5F6FB;display:flex;flex-direction:column;gap:6px}' +
    '.tdw-msg{max-width:80%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:18px;white-space:pre-wrap;word-break:break-word}' +
    '.tdw-in{align-self:flex-start;background:#fff;border:1px solid #E5E7F0;color:#1f2430}' +
    '.tdw-out{align-self:flex-end;background:#004751;color:#fff}' +
    '.tdw-img{max-width:100%;border-radius:8px;display:block;margin-bottom:4px}' +
    '.tdw-error{display:none;color:#B42318;font-size:11px;padding:0 12px 4px}' +
    '.tdw-foot{display:flex;gap:6px;padding:10px;border-top:1px solid #EEF0F6}' +
    '.tdw-input{flex:1;border:1px solid #E5E7F0;border-radius:10px;padding:8px 10px;font-size:13px;outline:none;resize:none;font-family:inherit}' +
    '.tdw-send{border:0;border-radius:10px;padding:0 14px;color:#fff;font-weight:700;cursor:pointer;font-size:13px}';
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.className = 'tdw-root';
  root.innerHTML =
    '<div class="tdw-panel">' +
    '  <div class="tdw-head"><span class="tdw-title">Atendimento</span><button class="tdw-close" type="button" aria-label="Fechar">&#10005;</button></div>' +
    '  <div class="tdw-list" role="log" aria-live="polite"></div>' +
    '  <div class="tdw-error" role="alert"></div>' +
    '  <div class="tdw-foot"><textarea class="tdw-input" rows="1" placeholder="Escreva sua mensagem..." aria-label="Escreva sua mensagem"></textarea><button class="tdw-send" type="button">Enviar</button></div>' +
    '</div>' +
    '<button class="tdw-bubble" type="button" aria-label="Abrir o chat">&#128172;<span class="tdw-dot"></span></button>';
  document.body.appendChild(root);

  root.querySelector('.tdw-bubble').addEventListener('click', function () { toggle(!state.open); });
  root.querySelector('.tdw-close').addEventListener('click', function () { toggle(false); });
  root.querySelector('.tdw-send').addEventListener('click', send);
  root.querySelector('.tdw-input').addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
  });

  api('/api/webchat/' + publicKey).then(function (config) {
    state.config = config;
    var color = config.color || '#004751';
    root.querySelector('.tdw-bubble').style.background = color;
    root.querySelector('.tdw-head').style.background = color;
    root.querySelector('.tdw-send').style.background = color;
    root.querySelector('.tdw-title').textContent = config.displayName || 'Atendimento';
    render();
  }).catch(function () { root.style.display = 'none'; });

  if (state.token) poll();
  setInterval(poll, POLL_MS);
})();
