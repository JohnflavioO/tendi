'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Copy, Globe2, Loader2, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { buildWebchatEmbedSnippet, checkDisplayName, checkGreeting, isValidWebchatColor } from '@/lib/webchat';

type Widget = { id: string; organization_id: string; public_key: string; is_enabled: boolean; display_name: string; greeting_message: string; color: string; ai_enabled: boolean };

const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#7C7EC0] disabled:bg-slate-50';
const label = 'mb-1.5 block text-xs font-semibold text-slate-600';

/** Canal "Conexões" > Webchat: liga/desliga, personaliza o widget e dá o código para colar no site. */
export function WebchatSettingsCard({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const supabase = useMemo(() => createClient() as any, []);
  const [widget, setWidget] = useState<Widget | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [color, setColor] = useState('#004751');
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // Agente de IA da empresa liberado (Console) — sem ele, a opção "IA" não tem efeito.
  const [agentReady, setAgentReady] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from('webchat_widgets').select('id,organization_id,public_key,is_enabled,display_name,greeting_message,color,ai_enabled').eq('organization_id', organizationId).maybeSingle();
      if (!active) return;
      if (data) {
        setWidget(data as Widget);
        setDisplayName((data as Widget).display_name);
        setGreeting((data as Widget).greeting_message);
        setColor((data as Widget).color);
      }
      const { data: agent } = await supabase.from('ai_agents').select('is_enabled').eq('organization_id', organizationId).maybeSingle();
      if (active) setAgentReady(Boolean(agent?.is_enabled));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [organizationId, supabase]);

  async function createWidget() {
    setSaving('create');
    setMessage(null);
    const { data, error } = await supabase.from('webchat_widgets').insert({ organization_id: organizationId }).select('id,organization_id,public_key,is_enabled,display_name,greeting_message,color,ai_enabled').single();
    setSaving('');
    if (error) { setMessage({ ok: false, text: `Não foi possível criar o widget: ${error.message}` }); return; }
    const created = data as Widget;
    setWidget(created);
    setDisplayName(created.display_name);
    setGreeting(created.greeting_message);
    setColor(created.color);
  }

  async function toggleEnabled() {
    if (!widget) return;
    setSaving('toggle');
    const { error } = await supabase.from('webchat_widgets').update({ is_enabled: !widget.is_enabled }).eq('id', widget.id);
    setSaving('');
    if (error) { setMessage({ ok: false, text: error.message }); return; }
    setWidget({ ...widget, is_enabled: !widget.is_enabled });
    setMessage({ ok: true, text: widget.is_enabled ? 'Widget desligado. O código no site para de responder.' : 'Widget ligado. Ele já responde no site.' });
  }

  async function setAiMode(enabled: boolean) {
    if (!widget || widget.ai_enabled === enabled) return;
    setSaving('ai');
    setMessage(null);
    const { error } = await supabase.from('webchat_widgets').update({ ai_enabled: enabled }).eq('id', widget.id);
    setSaving('');
    if (error) { setMessage({ ok: false, text: 'Não foi possível alterar o modo de atendimento.' }); return; }
    setWidget({ ...widget, ai_enabled: enabled });
    setMessage({ ok: true, text: enabled ? 'Pronto: o Agente de IA responde as próximas conversas do site.' : 'Pronto: as próximas conversas do site ficam só com a equipe.' });
  }

  async function save() {
    if (!widget) return;
    const nameError = checkDisplayName(displayName);
    if (nameError) { setMessage({ ok: false, text: nameError }); return; }
    const greetingError = checkGreeting(greeting);
    if (greetingError) { setMessage({ ok: false, text: greetingError }); return; }
    if (!isValidWebchatColor(color)) { setMessage({ ok: false, text: 'Cor inválida. Use o formato #004751.' }); return; }
    setSaving('save');
    setMessage(null);
    const { error } = await supabase.from('webchat_widgets').update({ display_name: displayName.trim(), greeting_message: greeting.trim(), color }).eq('id', widget.id);
    setSaving('');
    if (error) { setMessage({ ok: false, text: error.message }); return; }
    setWidget({ ...widget, display_name: displayName.trim(), greeting_message: greeting.trim(), color });
    setMessage({ ok: true, text: 'Widget atualizado.' });
  }

  async function copySnippet() {
    if (!widget) return;
    try { await navigator.clipboard.writeText(buildWebchatEmbedSnippet(widget.public_key, window.location.origin)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* o navegador recusou a cópia automática */ }
  }

  const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6';

  if (loading) return <section className={card}><Loader2 className="animate-spin text-[#2F316B]" size={20} /></section>;

  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="rounded-2xl bg-[#F0F0FA] p-4 text-[#2F316B]"><Globe2 size={24} /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-[#25275B]">Webchat</h2>
              {widget && <span className={widget.is_enabled ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700' : 'rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500'}>{widget.is_enabled ? 'Ativo' : 'Desligado'}</span>}
            </div>
            <p className="mt-1 text-xs text-slate-500">Widget de atendimento para o site da empresa. As conversas entram direto nesta Inbox.</p>
          </div>
        </div>
        {widget ? (
          <button type="button" onClick={() => void toggleEnabled()} disabled={!canManage || saving === 'toggle'} className={widget.is_enabled ? 'inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50' : 'inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-xs font-semibold text-white transition hover:bg-[#003B44] disabled:opacity-50'}>
            {saving === 'toggle' && <Loader2 size={14} className="animate-spin" />}{widget.is_enabled ? 'Desligar' : 'Ligar'} widget
          </button>
        ) : (
          <button type="button" onClick={() => void createWidget()} disabled={!canManage || saving === 'create'} className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-xs font-semibold text-white transition hover:bg-[#003B44] disabled:opacity-50">
            {saving === 'create' && <Loader2 size={14} className="animate-spin" />}Criar widget
          </button>
        )}
      </div>

      {message && <p role={message.ok ? 'status' : 'alert'} className={`mt-4 rounded-lg px-3 py-2 text-xs ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message.text}</p>}

      {widget && (
        <>
          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className={label}>Quem responde as conversas do site</p>
            <div role="radiogroup" aria-label="Quem responde as conversas do site" className="grid gap-3 sm:grid-cols-2">
              {[
                { value: true, icon: Bot, title: 'Agente de IA', text: 'Responde na hora, 24 horas, e chama a equipe quando precisa.' },
                { value: false, icon: UsersRound, title: 'Só a equipe', text: 'Atendimento manual: as conversas chegam no Inbox para alguém responder.' },
              ].map(option => {
                const active = (widget.ai_enabled !== false) === option.value;
                return <button key={String(option.value)} type="button" role="radio" aria-checked={active} disabled={!canManage || saving === 'ai'} onClick={() => void setAiMode(option.value)} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed ${active ? 'border-[#004751] bg-[#F1F8F7] ring-1 ring-[#004751]' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <span className={`rounded-xl p-2.5 ${active ? 'bg-[#004751] text-white' : 'bg-slate-100 text-slate-500'}`}><option.icon size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-sm font-semibold text-[#25275B]">{option.title}{active && (saving === 'ai' ? <Loader2 size={14} className="animate-spin text-[#004751]" /> : <Check size={15} className="text-[#004751]" />)}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{option.text}</span></span>
                </button>;
              })}
            </div>
            {widget.ai_enabled !== false && agentReady === false && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">O Agente de IA desta empresa ainda não está liberado. Até lá, as conversas do site ficam com a equipe.</p>}
            <p className="mt-2 text-[11px] text-slate-400">Vale para as próximas conversas. Em cada conversa, a equipe ainda pode ligar ou desligar a IA pelo Inbox.</p>
          </div>

          <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-[1fr_1fr_120px]">
            <label><span className={label}>Nome exibido</span><input value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={!canManage} className={field} /></label>
            <label><span className={label}>Mensagem de saudação</span><input value={greeting} onChange={event => setGreeting(event.target.value)} disabled={!canManage} className={field} /></label>
            <label><span className={label}>Cor</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#004751'} onChange={event => setColor(event.target.value)} disabled={!canManage} className={`${field} h-[42px] cursor-pointer p-1`} /></label>
          </div>
          {canManage && <button type="button" onClick={() => void save()} disabled={saving === 'save'} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-[#004751] hover:bg-slate-50 disabled:opacity-50">{saving === 'save' && <Loader2 size={14} className="animate-spin" />}Salvar personalização</button>}

          <div className="mt-5 rounded-xl bg-[#0B0D21] p-4">
            <div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-white/70">Cole este código no site, antes de &lt;/body&gt;</p>
              <button type="button" onClick={() => void copySnippet()} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copiado' : 'Copiar'}</button>
            </div>
            <code className="mt-2 block overflow-x-auto whitespace-pre text-[11px] leading-5 text-emerald-300">{buildWebchatEmbedSnippet(widget.public_key, typeof window !== 'undefined' ? window.location.origin : '')}</code>
          </div>
          {!widget.is_enabled && <p className="mt-2 text-[11px] text-amber-700">O widget está desligado: mesmo colado no site, ele não aparece até você ligar aqui em cima.</p>}
        </>
      )}
    </section>
  );
}
