// Gera as artes do Instagram do TendiDesk (HTML -> PNG 1080x1350).
// Uso: node marketing/instagram/fonte/gerar.js
// Precisa do Microsoft Edge (ou Chrome) instalado. Fontes vêm do Google Fonts (precisa de internet).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const HTML_DIR = path.join(ROOT, 'html');
const OUT = {
  grade: path.join(ROOT, '..', 'posts'),
  carrossel: path.join(ROOT, '..', 'carrossel'),
};
const LOGO = 'logo.png';
const LOGO_WHITE = 'logo-branca.png';

// ---------- peças ----------
const curves = (variant, a = '#2F316B', b = '#CB0A9F') => {
  const paths = {
    // curva grande vindo do canto inferior + linha magenta
    corner: `<path d="M-60 1180 C 260 980, 520 1300, 1140 960 L1140 1420 L-60 1420 Z" fill="${a}"/>
             <path d="M-40 1090 C 300 900, 560 1240, 1120 900" fill="none" stroke="${b}" stroke-width="10"/>`,
    // arco no alto à direita + onda embaixo
    arc: `<circle cx="1010" cy="140" r="330" fill="none" stroke="${a}" stroke-width="54"/>
          <path d="M-60 1330 C 300 1270, 640 1400, 1140 1300" fill="none" stroke="${b}" stroke-width="10"/>`,
    // só linhas finas (para fundos escuros)
    lines: `<circle cx="1000" cy="80" r="300" fill="none" stroke="${a}" stroke-width="3" opacity=".35"/>
            <circle cx="60" cy="1330" r="420" fill="none" stroke="${a}" stroke-width="3" opacity=".25"/>
            <path d="M-40 1170 C 320 1010, 620 1320, 1120 1060" fill="none" stroke="${b}" stroke-width="10"/>`,
    // balão de conversa grande ao fundo
    bubble: `<path d="M640 120 h340 a120 120 0 0 1 120 120 v260 a120 120 0 0 1 -120 120 h-200 l-90 90 v-90 h-50 a120 120 0 0 1 -120 -120 v-260 a120 120 0 0 1 120 -120 z" fill="none" stroke="${a}" stroke-width="40" opacity=".9"/>
             <path d="M-60 1220 C 300 1100, 660 1360, 1140 1150" fill="none" stroke="${b}" stroke-width="10"/>`,
  };
  return `<svg class="curves" viewBox="0 0 1080 1350" preserveAspectRatio="none">${paths[variant]}</svg>`;
};

const footer = (white) => `<div class="footer"><img src="${white ? LOGO_WHITE : LOGO}" alt="TendiDesk"><span class="site">tendidesk.com.br</span></div>`;

const avatar = (initials, color) => `<span class="av" style="background:${color}">${initials}</span>`;

const inboxCard = (style = '') => `<div class="card inbox" style="${style}">
  <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px 16px"><b style="font-size:26px;color:#2F316B">Atendimentos</b><span class="tag f">4 novas</span></div>
  <div class="row active">${avatar('MC', '#2F316B')}<div class="who"><b>Mariana Costa</b><span>Quero agendar uma avaliação</span></div><span class="tag c">Comercial</span></div>
  <div class="row">${avatar('PA', '#CB0A9F')}<div class="who"><b>Pedro Alves</b><span>O pedido já saiu para entrega?</span></div><span class="tag s">Suporte</span></div>
  <div class="row">${avatar('JR', '#004751')}<div class="who"><b>Juliana Rocha</b><span>Pode me mandar a 2ª via?</span></div><span class="tag f">Financeiro</span></div>
  <div class="row">${avatar('CM', '#7C7EC0')}<div class="who"><b>Carlos Mendes</b><span>Qual o horário de sábado?</span></div><span class="tag ia">Agente de IA</span></div>
</div>`;

const phone = (contact, initials, status, messages, style = '') => `<div class="phone" style="${style}"><div class="screen">
  <div class="bar"><span class="avatar">${initials}</span><div><b>${contact}</b><span>${status}</span></div></div>
  <div class="msgs">${messages.map(([dir, text, time, sign]) => `<div class="bubble ${dir}">${sign ? `<span class="sign">${sign}</span>` : ''}${text}<span class="time">${time}</span></div>`).join('')}</div>
</div></div>`;

// QR Code ilustrativo (padrão fixo, não é um código real)
const qr = () => {
  let cells = '';
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    const finder = (cx, cy) => x >= cx && x < cx + 7 && y >= cy && y < cy + 7 && !(x > cx && x < cx + 6 && y > cy && y < cy + 6 && !(x > cx + 1 && x < cx + 5 && y > cy + 1 && y < cy + 5));
    const inFinderArea = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
    const on = inFinderArea ? (finder(0, 0) || finder(14, 0) || finder(0, 14)) : ((x * 7 + y * 13 + x * y) % 5 < 2);
    cells += `<i class="${on ? '' : 'o'}"></i>`;
  }
  return `<div class="qr">${cells}</div>`;
};

const dots = (n, on) => `<div class="steps-dots">${Array.from({ length: n }, (_, i) => `<i class="${i === on ? 'on' : ''}"></i>`).join('')}</div>`;

// ---------- posts da grade ----------
const posts = [
  { file: '01-apresentacao', cls: 'light', body: `${curves('corner')}
    <p class="kicker">Atendimento e CRM no WhatsApp</p>
    <h1 style="margin-top:28px;font-size:86px">Seu <span class="ring">atendimento</span><br>não precisa<br>perder nada.</h1>
    <p class="lead">Conversas, equipe, vendas e Agente de IA no mesmo lugar.</p>
    <div style="position:relative;margin-top:56px;height:560px">
      ${inboxCard('width:610px;')}
      ${phone('Mariana Costa', 'MC', 'online', [['in', 'Oi! Quero agendar uma avaliação.', '10:12'], ['out', 'Claro, Mariana! Tenho quinta às 15h ou sexta às 10h.', '10:13', 'Ana · Comercial'], ['in', 'Quinta às 15h, por favor!', '10:13']], 'position:absolute;right:0;top:-20px;transform:scale(.74);transform-origin:top right')}
    </div>
    <div class="footer" style="margin-top:auto"><img src="${LOGO_WHITE}" alt="TendiDesk"><span class="pill white-bg">Teste grátis por 7 dias</span></div>` },

  { file: '02-um-numero', cls: 'navy', body: `${curves('lines', '#7C7EC0')}
    <p class="kicker">Inbox compartilhado</p>
    <h1 style="margin-top:28px">Um número.<br>Vários atendentes.<br><span class="hl">Setores organizados.</span></h1>
    <p class="lead">Toda a equipe atende pelo mesmo WhatsApp. Cada conversa vai para o setor certo e ninguém responde em dobro.</p>
    <div style="margin-top:60px;display:flex;gap:18px;flex-wrap:wrap">
      <span class="pill white-bg" style="font-size:28px">Comercial</span>
      <span class="pill white-bg" style="font-size:28px">Suporte</span>
      <span class="pill white-bg" style="font-size:28px">Financeiro</span>
      <span class="pill magenta-bg" style="font-size:28px">+ o seu setor</span>
    </div>
    ${footer(true)}` },

  { file: '03-agente-24h', cls: 'light', body: `${curves('arc', '#D9DAF0')}
    <p class="kicker">Agente de IA no WhatsApp</p>
    <h1 style="margin-top:28px;font-size:92px">Seu cliente<br>chamou às 23h.<br><span class="hl">Alguém respondeu.</span></h1>
    <div style="display:flex;gap:56px;align-items:flex-start;margin-top:54px">
      ${phone('Carlos Mendes', 'CM', 'online', [['in', 'Boa noite! Vocês abrem sábado?', '23:04'], ['out', 'Boa noite, Carlos! Abrimos sábado das 8h às 12h. Quer que eu reserve um horário?', '23:04', 'Sofia · Atendimento'], ['in', 'Quero sim, às 9h', '23:05'], ['out', 'Pronto! Sábado às 9h está reservado.', '23:05', 'Sofia · Atendimento']], 'transform:scale(.86);transform-origin:top left;margin-right:-50px;margin-bottom:-90px')}
      <div style="padding-top:30px">
        <p style="font-size:34px;line-height:1.4;font-weight:600;color:#2F316B">O Agente de IA responde 24 horas com as informações do seu negócio.</p>
        <p style="margin-top:28px;font-size:30px;line-height:1.45;color:#6B6F93">Quando o assunto pede uma pessoa, ele chama alguém da equipe.</p>
      </div>
    </div>
    ${footer(false)}` },

  { file: '04-visto-por-ultimo', cls: 'magenta', body: `${curves('lines', '#FFFFFF', '#2F316B')}
    <div class="spacer"></div>
    <h1 style="font-size:112px">Quantas vendas<br>ficaram no<br>“visto por<br>último”?</h1>
    <p class="lead" style="margin-top:44px;font-size:38px">Cliente que espera procura outra empresa. Com o TendiDesk, nenhuma conversa fica sem dono.</p>
    <div class="spacer"></div>
    ${footer(true)}` },

  { file: '05-crm', cls: 'light', body: `${curves('arc', '#D9DAF0')}
    <p class="kicker">CRM integrado</p>
    <h1 style="margin-top:28px">Conversa boa<br><span class="hl">vira venda.</span></h1>
    <p class="lead">Cada cliente vira um card no funil. Você vê em que etapa está cada negociação.</p>
    <div class="kanban" style="margin-top:56px">
      <div class="col"><h4>Novo contato <span>3</span></h4><div class="deal"><b>Mariana Costa</b><span>Avaliação</span></div><div class="deal"><b>Rafael Lima</b><span>Orçamento</span></div></div>
      <div class="col"><h4>Proposta <span>2</span></h4><div class="deal"><b>Bella Moda</b><span>Plano anual</span><div class="val">R$ 2.400</div></div><div class="deal"><b>Pedro Alves</b><span>Pacote 10 sessões</span></div></div>
      <div class="col" style="background:#E8F4F2"><h4>Fechado <span>4</span></h4><div class="deal"><b>Juliana Rocha</b><span>Contrato assinado</span><div class="val">R$ 890</div></div></div>
    </div>
    ${footer(false)}` },

  { file: '06-papeis', cls: 'deep', body: `${curves('lines', '#7C7EC0')}
    <p class="kicker">Equipe com papéis</p>
    <h1 style="margin-top:28px;font-size:92px">Cada pessoa com<br>seu login. <span class="hl">Você<br>no controle.</span></h1>
    <div class="roles" style="margin-top:56px">
      <div class="role"><span class="badge" style="background:#CB0A9F">D</span><div><b>Dono e Administrador</b><span>Tudo, inclusive assinatura e Agente de IA</span></div></div>
      <div class="role"><span class="badge" style="background:#7C7EC0">S</span><div><b>Supervisor</b><span>Conexões, equipe e relatórios</span></div></div>
      <div class="role"><span class="badge" style="background:#FFFFFF;color:#2F316B">A</span><div><b>Atendente</b><span>Inbox, agenda, CRM e contatos</span></div></div>
    </div>
    ${footer(true)}` },

  { file: '07-assinatura', cls: 'light', body: `${curves('arc', '#D9DAF0')}
    <p class="kicker">Assinatura nas mensagens</p>
    <h1 style="margin-top:28px;font-size:96px">Seu cliente sabe<br><span class="hl">com quem está<br>falando.</span></h1>
    <div style="display:flex;gap:50px;align-items:flex-start;margin-top:50px">
      ${phone('Clínica Sorriso', 'CS', 'Conta comercial', [['in', 'Oi, meu retorno é amanhã?', '09:41'], ['out', 'Bom dia! Sim, amanhã às 14h com a Dra. Paula.', '09:42', 'Ana · Recepção'], ['in', 'E o valor do clareamento?', '09:44'], ['out', 'Vou te passar todos os detalhes agora.', '09:45', 'Bruno · Comercial']], 'transform:scale(.8);transform-origin:top left;margin-right:-70px;margin-bottom:-140px')}
      <p style="padding-top:40px;font-size:34px;line-height:1.45;font-weight:600;color:#2F316B">O nome de quem atende aparece no WhatsApp do cliente. Atendimento mais humano, do jeito da sua empresa.</p>
    </div>
    ${footer(false)}` },

  { file: '08-planos', cls: 'light', body: `${curves('arc', '#D9DAF0')}
    <p class="kicker">Planos</p>
    <h1 style="margin-top:24px;font-size:96px">Simples assim.</h1>
    <p class="lead" style="margin-top:22px">Pague por mês ou economize <b style="color:#CB0A9F">15% no anual</b>.</p>
    <div class="plans" style="margin-top:60px">
      <div class="plan"><div class="name">Start</div><div class="price"><sup>R$</sup>189<small>/mês</small></div><ul><li>Até 4 usuários</li><li>1.000 respostas do Agente de IA por mês</li><li>Inbox, agenda, CRM e contatos</li></ul></div>
      <div class="plan pro"><span class="flag">Mais completo</span><div class="name">Pro</div><div class="price"><sup>R$</sup>289<small>/mês</small></div><ul><li>Até 10 usuários</li><li>3.000 respostas do Agente de IA por mês</li><li>Até 10 setores</li><li>Segunda via de boleto</li></ul></div>
    </div>
    <p style="margin-top:40px;font-size:28px;font-weight:600;color:#2F316B">Comece com 7 dias grátis. Sem cartão de crédito.</p>
    ${footer(false)}` },

  { file: '09-teste-gratis', cls: 'deep', body: `${curves('bubble', '#3E4190', '#CB0A9F')}
    <div class="spacer"></div>
    <p class="kicker">Comece hoje</p>
    <h1 style="margin-top:28px;font-size:124px">Teste grátis<br>por <span class="hl">7 dias.</span></h1>
    <p class="lead" style="font-size:40px">Sem cartão de crédito. Conecte seu WhatsApp e veja sua equipe atendendo melhor ainda nesta semana.</p>
    <div style="margin-top:56px"><span class="pill magenta-bg" style="font-size:34px;padding:24px 40px">Link na bio · tendidesk.com.br</span></div>
    <div class="spacer"></div>
    <div class="footer"><img src="${LOGO_WHITE}" alt="TendiDesk"></div>` },
];

// ---------- carrossel ----------
const carousel = [
  { file: '01-capa', cls: 'navy', body: `${curves('lines', '#7C7EC0')}
    <p class="kicker">Guia rápido</p>
    <h1 style="margin-top:28px;font-size:112px">Seu atendimento<br>no ar em<br><span class="hl">4 passos.</span></h1>
    <p class="lead">Do WhatsApp conectado à equipe vendendo pelo CRM.</p>
    <div class="spacer"></div>
    <div class="footer"><img src="${LOGO_WHITE}" alt="TendiDesk"><span class="swipe">Arraste para o lado →</span></div>` },

  { file: '02-conecte', cls: 'light', body: `${curves('arc', '#D9DAF0')}
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><span class="big-num">1</span>${dots(4, 0)}</div>
    <h1 style="margin-top:40px;font-size:92px">Conecte seu<br><span class="hl">WhatsApp.</span></h1>
    <p class="lead">Leia o QR Code com o celular da empresa. Em instantes, as conversas chegam no TendiDesk.</p>
    <div style="margin-top:60px;display:flex;align-items:center;gap:48px">${qr()}<p style="font-size:30px;line-height:1.45;color:#2F316B;font-weight:600">Mesmo número que seus clientes já conhecem.</p></div>
    ${footer(false)}` },

  { file: '03-ensine-a-ia', cls: 'light', body: `${curves('arc', '#D9DAF0')}
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><span class="big-num">2</span>${dots(4, 1)}</div>
    <h1 style="margin-top:40px;font-size:92px">Ensine o<br><span class="hl">Agente de IA.</span></h1>
    <p class="lead">Escreva como você explicaria para um novo funcionário.</p>
    <div class="card" style="margin-top:50px;padding:30px">
      <div class="form-row"><small>Horários</small><p>Segunda a sexta, 8h às 18h. Sábado, 8h às 12h.</p></div>
      <div class="form-row"><small>Serviços e preços</small><p>Avaliação gratuita. Clareamento a partir de R$ 600.</p></div>
      <div class="form-row"><small>Quando chamar a equipe</small><p>Reclamações, negociação de valores e urgências.</p></div>
    </div>
    ${footer(false)}` },

  { file: '04-convide', cls: 'light', body: `${curves('arc', '#D9DAF0')}
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><span class="big-num">3</span>${dots(4, 2)}</div>
    <h1 style="margin-top:40px;font-size:92px">Convide sua<br><span class="hl">equipe.</span></h1>
    <p class="lead">Cada pessoa recebe o convite por e-mail e entra com o próprio login.</p>
    <div class="card inbox" style="margin-top:50px">
      <div class="row">${avatar('AN', '#CB0A9F')}<div class="who"><b>Ana Souza</b><span>ana@clinicasorriso.com.br</span></div><span class="tag s">Supervisor</span></div>
      <div class="row">${avatar('BR', '#2F316B')}<div class="who"><b>Bruno Reis</b><span>bruno@clinicasorriso.com.br</span></div><span class="tag c">Atendente</span></div>
      <div class="row">${avatar('LT', '#004751')}<div class="who"><b>Larissa Teixeira</b><span>Convite enviado</span></div><span class="tag f">Atendente</span></div>
    </div>
    ${footer(false)}` },

  { file: '05-acompanhe', cls: 'light', body: `${curves('arc', '#D9DAF0')}
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><span class="big-num">4</span>${dots(4, 3)}</div>
    <h1 style="margin-top:40px;font-size:92px">Acompanhe<br><span class="hl">tudo.</span></h1>
    <p class="lead">Conversas por setor, negociações no CRM e relatórios do atendimento.</p>
    ${inboxCard('margin-top:46px')}
    ${footer(false)}` },

  { file: '06-comece', cls: 'deep', body: `${curves('bubble', '#3E4190', '#CB0A9F')}
    <div class="spacer"></div>
    <h1 style="font-size:116px">Pronto para<br>atender <span class="hl">melhor?</span></h1>
    <p class="lead" style="font-size:40px">Teste grátis por 7 dias, sem cartão de crédito.</p>
    <div style="margin-top:56px"><span class="pill magenta-bg" style="font-size:34px;padding:24px 40px">Link na bio · tendidesk.com.br</span></div>
    <div class="spacer"></div>
    <div class="footer"><img src="${LOGO_WHITE}" alt="TendiDesk"></div>` },
];

// ---------- gerar ----------
const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
if (!browser) throw new Error('Instale o Microsoft Edge ou o Google Chrome.');
fs.mkdirSync(HTML_DIR, { recursive: true });
for (const dir of Object.values(OUT)) fs.mkdirSync(dir, { recursive: true });
for (const logo of [[LOGO, 'tendidesk-logo.png'], [LOGO_WHITE, 'tendidesk-logo-branca.png']]) {
  fs.copyFileSync(path.join(ROOT, '..', '..', '..', 'apps', 'web', 'public', 'brand', logo[1]), path.join(HTML_DIR, logo[0]));
}
fs.copyFileSync(path.join(ROOT, 'estilo.css'), path.join(HTML_DIR, 'estilo.css'));

const only = process.argv[2];
for (const [group, list] of [['grade', posts], ['carrossel', carousel]]) {
  for (const art of list) {
    const name = `${group}-${art.file}`;
    if (only && !name.includes(only)) continue;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="estilo.css"></head><body><div class="art ${art.cls}">${art.body}</div></body></html>`;
    const htmlPath = path.join(HTML_DIR, `${name}.html`);
    fs.writeFileSync(htmlPath, html);
    const png = path.join(OUT[group], `${art.file}.png`);
    // Perfil separado: sem ele o navegador repassa o pedido para a janela já aberta e não grava a imagem.
    const profile = path.join(require('os').tmpdir(), 'tendidesk-artes');
    const args = ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${profile}`, '--force-device-scale-factor=1', '--window-size=1080,1350', '--virtual-time-budget=6000', `--screenshot=${png}`, `file:///${htmlPath.replace(/\\/g, '/').replace(/ /g, '%20')}`];
    if (fs.existsSync(png)) fs.unlinkSync(png);
    for (let attempt = 1; !fs.existsSync(png); attempt++) {
      if (attempt > 3) throw new Error(`Imagem não gerada: ${png}`);
      try { execFileSync(browser, args, { stdio: 'ignore', timeout: 90000 }); } catch { /* tenta de novo */ }
    }
    console.log('ok', path.relative(path.join(ROOT, '..'), png));
  }
}
