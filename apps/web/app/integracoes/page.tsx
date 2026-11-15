'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, FileText, KeyRound, Loader2, Lock, MessageCircle, Search, ShieldCheck, Sparkles, TriangleAlert, Unplug } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { requestedOrganizationId, resolveCurrentOrganization } from '@/lib/current-organization';
import { WorkspaceShell } from '@/components/workspace-shell';
import { Badge, Card } from '@/components/ui';
import { BOLETO_PROVIDERS, type BoletoProviderId } from '@/lib/boleto';

type Org = { id: string; name: string };
type Integration = {
  id: string; provider: BoletoProviderId; status: string; environment: 'production' | 'sandbox'; account_label: string | null;
  key_hint: string | null; is_enabled: boolean; last_verified_at: string | null; last_error: string | null;
};
type State = { planAllowed: boolean; ready: boolean; integration: Integration | null };
type TestResult = { document: string; count: number; boletos: Array<{ amount: number; dueDate: string; overdue: boolean; hasDigitableLine: boolean; hasPdf: boolean }> };

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

async function api(method: string, body?: Record<string, unknown>, query = '') {
  const response = await fetch(`/api/integrations/boleto${query}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Algo deu errado. Tente de novo.');
  return payload;
}

/** Exemplo de conversa: mostra ao dono da empresa o que o cliente dele vai ver. */
function ConversationPreview() {
  const bubble = 'max-w-[85%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-5';
  return <div className="space-y-2 rounded-2xl bg-tendi-haze p-4">
    <p className={`${bubble} ml-auto rounded-br-md bg-white text-slate-700 shadow-card`}>Oi, preciso da 2ª via do boleto</p>
    <p className={`${bubble} rounded-bl-md bg-tendi-teal/10 text-tendi-navy`}>Claro! Me passa o CPF ou CNPJ do titular, só os números?</p>
    <p className={`${bubble} ml-auto rounded-br-md bg-white text-slate-700 shadow-card`}>123.456.789-09</p>
    <div className={`${bubble} rounded-bl-md bg-tendi-teal/10 text-tendi-navy`}>
      Encontrei o seu boleto em aberto:<br /><br />
      R$ 189,00 · vence em 20/11/2026<br />
      Linha digitável: 23793.38128 60000.000003 …<br />
      PDF do boleto: asaas.com/b/pdf/…
    </div>
  </div>;
}

function Steps() {
  const items = [
    { icon: KeyRound, title: 'Conecte o seu sistema de cobrança', text: 'Cole a chave de API uma vez. Ela fica guardada com criptografia.' },
    { icon: MessageCircle, title: 'O cliente pede a 2ª via', text: 'No WhatsApp, no Instagram ou no chat do site. A Duda pede o CPF ou CNPJ.' },
    { icon: FileText, title: 'A Duda envia na hora', text: 'Linha digitável e PDF dos boletos em aberto, sem ninguém da equipe parar.' },
  ];
  return <ol className="grid gap-3 sm:grid-cols-3">
    {items.map(({ icon: Icon, title, text }, index) => <li key={title} className="rounded-2xl border border-tendi-line/80 bg-white p-4">
      <span className="flex items-center gap-2 text-xs font-semibold text-tendi-teal"><Icon size={15} />Passo {index + 1}</span>
      <p className="mt-2 text-sm font-semibold text-tendi-navy">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </li>)}
  </ol>;
}

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? 'bg-tendi-teal' : 'bg-slate-300'}`}>
    <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
  </button>;
}

export default function IntegrationsPage() {
  const [org, setOrg] = useState<Org | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<BoletoProviderId>('asaas');
  const [apiKey, setApiKey] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [document, setDocument] = useState('');
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  useEffect(() => {
    void (async () => {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      const { organization } = await resolveCurrentOrganization<Org>(supabase, auth.user.id, 'id,name', requestedOrganizationId());
      if (!organization) { setError('Empresa não encontrada.'); return; }
      setOrg(organization);
      setState(await api('GET', undefined, `?organizationId=${organization.id}`));
    })().catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar.'));
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Algo deu errado.'); } finally { setBusy(false); }
  }

  const connect = () => run(async () => {
    if (!org) return;
    const result = await api('POST', { organizationId: org.id, provider, apiKey });
    setApiKey(''); setReplacing(false); setTest(null);
    setState(current => current ? { ...current, integration: result.integration } : current);
    setNotice('Pronto! A Duda já pode enviar a 2ª via de boleto aos seus clientes.');
  });

  const toggle = (isEnabled: boolean) => run(async () => {
    if (!org) return;
    const result = await api('PATCH', { organizationId: org.id, isEnabled });
    setState(current => current ? { ...current, integration: result.integration } : current);
    setNotice(isEnabled ? 'A Duda voltou a enviar a 2ª via.' : 'A 2ª via pela Duda está pausada. A chave continua guardada.');
  });

  const disconnect = () => run(async () => {
    if (!org || !window.confirm('Desconectar o sistema de cobrança? A chave guardada será apagada e a Duda deixa de enviar boletos.')) return;
    await api('DELETE', { organizationId: org.id });
    setState(current => current ? { ...current, integration: null } : current);
    setTest(null);
    setNotice('Sistema de cobrança desconectado e chave apagada.');
  });

  async function runTest() {
    if (!org) return;
    setTesting(true); setError(''); setTest(null);
    try { setTest(await api('POST', { organizationId: org.id, action: 'test', document })); } catch (err) { setError(err instanceof Error ? err.message : 'Falha no teste.'); } finally { setTesting(false); }
  }

  const integration = state?.integration ?? null;
  const providerInfo = BOLETO_PROVIDERS.find(item => item.id === (integration?.provider ?? provider)) ?? BOLETO_PROVIDERS[0]!;

  return <WorkspaceShell title="Integrações" description="Conecte outros sistemas da sua empresa ao atendimento">
    <div className="mx-auto max-w-4xl space-y-5">
      {error && <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700"><TriangleAlert size={16} className="mt-0.5 shrink-0" />{error}</p>}
      {notice && <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 size={16} className="mt-0.5 shrink-0" />{notice}</p>}

      <Card
        icon={FileText}
        tone="teal"
        title="2ª via de boleto automática"
        description="Seu cliente pede o boleto pelo chat e recebe a linha digitável e o PDF em segundos."
        actions={state && (!state.planAllowed
          ? <Badge tone="magenta"><Sparkles size={12} />Plano Pro</Badge>
          : integration
            ? integration.status === 'connected'
              ? <Badge tone={integration.is_enabled ? 'success' : 'neutral'} dot>{integration.is_enabled ? 'Ativa' : 'Pausada'}</Badge>
              : <Badge tone="danger" dot>Precisa de atenção</Badge>
            : <Badge tone="neutral">Não conectada</Badge>)}
      >
        {!state && !error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Carregando…</p>}

        {state && !state.planAllowed && <div className="space-y-5">
          <Steps />
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-tendi-magenta/20 bg-gradient-to-br from-tendi-magenta/5 to-tendi-lilac/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="td-icon td-icon-magenta !size-9 shrink-0"><Lock size={16} /></span>
              <div>
                <p className="text-sm font-semibold text-tendi-navy">Disponível no TendiDesk Pro</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">Menos pedidos de boleto para a equipe e pagamentos em dia. Faça o upgrade e conecte em poucos minutos.</p>
              </div>
            </div>
            {org && <a href={`/assinatura?organization=${org.id}`} className="td-btn td-btn-accent shrink-0">Conhecer o plano Pro</a>}
          </div>
        </div>}

        {state && state.planAllowed && !state.ready && <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><TriangleAlert size={16} className="mt-0.5 shrink-0" />Este recurso está sendo ativado na sua conta. Volte em instantes.</p>}

        {state && state.planAllowed && state.ready && (!integration || replacing) && <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            {!integration && <Steps />}
            <div>
              <p className="td-label">Sistema de cobrança</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {BOLETO_PROVIDERS.map(item => <button key={item.id} type="button" onClick={() => setProvider(item.id)}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${provider === item.id ? 'border-tendi-teal bg-tendi-teal/5 text-tendi-teal' : 'border-tendi-line text-slate-600 hover:border-slate-300'}`}>{item.label}</button>)}
              </div>
              <p className="mt-2 text-[11.5px] text-slate-400">Usa outro sistema de cobrança? Fale com o suporte do TendiDesk.</p>
            </div>
            <label className="block">
              <span className="td-label">Chave de API do {providerInfo.label}</span>
              <input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="$aact_..." className="td-input mt-1 font-mono" />
              <span className="mt-1.5 block text-xs leading-5 text-slate-500">{providerInfo.keyHelp} <a href={providerInfo.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-tendi-teal underline">Abrir o {providerInfo.label}<ExternalLink size={11} /></a></span>
            </label>
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-tendi-teal" />A chave é usada só para consultar boletos em aberto e fica guardada com criptografia. Ninguém da sua equipe consegue vê-la depois de salva.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void connect()} disabled={busy || apiKey.trim().length < 20} className="td-btn td-btn-teal disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}Conectar</button>
              {replacing && <button type="button" onClick={() => { setReplacing(false); setApiKey(''); }} className="td-btn td-btn-secondary">Cancelar</button>}
            </div>
          </div>
          <div><p className="td-label mb-2">O que o cliente vê</p><ConversationPreview /></div>
        </div>}

        {state && state.planAllowed && state.ready && integration && !replacing && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-tendi-line/80 p-4"><p className="td-eyebrow">Sistema</p><p className="mt-1.5 text-sm font-semibold text-tendi-navy">{providerInfo.label}{integration.environment === 'sandbox' && <Badge tone="warning" className="ml-2">Teste</Badge>}</p>{integration.account_label && <p className="mt-0.5 truncate text-xs text-slate-500">{integration.account_label}</p>}</div>
            <div className="rounded-2xl border border-tendi-line/80 p-4"><p className="td-eyebrow">Chave</p><p className="mt-1.5 font-mono text-sm text-tendi-navy">•••• {integration.key_hint ?? ''}</p><p className="mt-0.5 text-xs text-slate-500">Guardada com criptografia</p></div>
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-tendi-line/80 p-4">
              <div><p className="td-eyebrow">Duda envia a 2ª via</p><p className="mt-1.5 text-xs leading-5 text-slate-500">{integration.is_enabled ? 'Ligado em todos os canais com IA.' : 'Pausado.'}</p></div>
              <Switch checked={integration.is_enabled} disabled={busy || integration.status !== 'connected'} onChange={value => void toggle(value)} label="Duda envia a 2ª via" />
            </div>
          </div>

          {integration.status !== 'connected' && <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700"><TriangleAlert size={16} className="mt-0.5 shrink-0" />{integration.last_error ?? 'O sistema de cobrança recusou a chave.'} Troque a chave para voltar a enviar boletos.</p>}

          <div className="rounded-2xl bg-tendi-haze p-4">
            <p className="text-sm font-semibold text-tendi-navy">Testar com um CPF ou CNPJ</p>
            <p className="mt-0.5 text-xs text-slate-500">Confere o que a Duda encontraria. Nada é enviado ao cliente.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input inputMode="numeric" value={document} onChange={event => setDocument(event.target.value)} placeholder="CPF ou CNPJ" className="td-input sm:max-w-xs" />
              <button type="button" onClick={() => void runTest()} disabled={testing || document.replace(/\D/g, '').length < 11} className="td-btn td-btn-secondary disabled:opacity-50">{testing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}Buscar boletos</button>
            </div>
            {test && <div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600 shadow-card">
              {test.count === 0
                ? <p>Nenhum boleto em aberto para o {test.document}.</p>
                : <>
                  <p className="font-semibold text-tendi-navy">{test.count} {test.count === 1 ? 'boleto em aberto' : 'boletos em aberto'} para o {test.document}</p>
                  <ul className="mt-2 space-y-1">{test.boletos.map(item => <li key={`${item.dueDate}-${item.amount}`} className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">{brl(item.amount)} · vence em {brDate(item.dueDate)}</span>
                    {item.overdue && <Badge tone="warning">Vencido</Badge>}
                    {!item.hasDigitableLine && <Badge tone="neutral">Sem linha digitável</Badge>}
                  </li>)}</ul>
                </>}
            </div>}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-tendi-line/70 pt-4">
            <button type="button" onClick={() => { setReplacing(true); setProvider(integration.provider); }} className="td-btn td-btn-secondary"><KeyRound size={14} />Trocar chave</button>
            <button type="button" onClick={() => void disconnect()} disabled={busy} className="td-btn td-btn-ghost text-red-600"><Unplug size={14} />Desconectar</button>
          </div>
        </div>}
      </Card>
    </div>
  </WorkspaceShell>;
}
