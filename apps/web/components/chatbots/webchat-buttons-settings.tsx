'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MAX_BUTTON_LABEL, MAX_NOTICE, MAX_QUICK_REPLIES, MAX_QUICK_TEXT, normalizeWebchatSettings, type WebchatSettings } from '@/lib/webchat-config';

const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#7C7EC0] disabled:bg-slate-50 disabled:text-slate-400';
const label = 'mb-1.5 block text-xs font-semibold text-slate-600';

function Switch({ checked, onChange, disabled, title }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; title: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={title} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? 'bg-[#004751]' : 'bg-slate-300'}`}>
    <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
  </button>;
}

function Row({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#25275B]">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p></div>{children}</div>;
}

/** Conexões › Webchat › Botões e fila: o que aparece no chat do site e como a fila de atendimento se comporta. */
export function WebchatButtonsSettings({ widgetId, initial, canManage, onSaved }: { widgetId: string; initial: unknown; canManage: boolean; onSaved?: (settings: WebchatSettings) => void }) {
  const [settings, setSettings] = useState<WebchatSettings>(() => normalizeWebchatSettings(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const update = (patch: Partial<WebchatSettings>) => { setSettings(current => ({ ...current, ...patch })); setMessage(null); };

  async function save() {
    const clean = normalizeWebchatSettings(settings);
    setSaving(true);
    const { error } = await (createClient() as any).from('webchat_widgets').update({ settings: clean }).eq('id', widgetId);
    setSaving(false);
    if (error) { setMessage({ ok: false, text: 'Não foi possível salvar os botões.' }); return; }
    setSettings(clean);
    onSaved?.(clean);
    setMessage({ ok: true, text: 'Botões e fila salvos. O chat do site já usa a nova configuração.' });
  }

  const quick = settings.quickReplies;
  const setQuick = (index: number, patch: Partial<{ label: string; text: string }>) => update({ quickReplies: quick.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

  return <div className="mt-5 border-t border-slate-100 pt-5">
    <h3 className="text-sm font-bold text-[#25275B]">Botões e fila</h3>
    <p className="mt-0.5 text-xs text-slate-500">Atalhos que aparecem acima do campo de mensagem e o aviso de fila quando o visitante espera por uma pessoa.</p>

    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <Row title="Falar com atendente" text="Tira a IA da conversa e coloca o visitante na fila da equipe.">
          <Switch title="Mostrar botão Falar com atendente" checked={settings.handoffButton.enabled} disabled={!canManage} onChange={enabled => update({ handoffButton: { ...settings.handoffButton, enabled } })} />
        </Row>
        <label><span className={label}>Texto do botão</span><input value={settings.handoffButton.label} maxLength={MAX_BUTTON_LABEL} disabled={!canManage || !settings.handoffButton.enabled} onChange={e => update({ handoffButton: { ...settings.handoffButton, label: e.target.value } })} className={field} /></label>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <Row title="Encerrar atendimento" text="O visitante finaliza a conversa (com confirmação). Ela sai das abertas no Inbox.">
          <Switch title="Mostrar botão Encerrar atendimento" checked={settings.endButton.enabled} disabled={!canManage} onChange={enabled => update({ endButton: { ...settings.endButton, enabled } })} />
        </Row>
        <label><span className={label}>Mensagem ao encerrar</span><input value={settings.endMessage} maxLength={MAX_NOTICE} disabled={!canManage || !settings.endButton.enabled} onChange={e => update({ endMessage: e.target.value })} className={field} /></label>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <Row title="Fila de atendimento" text="Quando o visitante aguarda uma pessoa: no horário da equipe mostra a posição; fora do horário, avisa quando a equipe volta.">
          <Switch title="Mostrar aviso de fila" checked={settings.queue.enabled} disabled={!canManage} onChange={enabled => update({ queue: { ...settings.queue, enabled } })} />
        </Row>
        <label><span className={label}>Mensagem da fila</span><input value={settings.queue.message} maxLength={MAX_NOTICE} disabled={!canManage || !settings.queue.enabled} onChange={e => update({ queue: { ...settings.queue, message: e.target.value } })} className={field} /></label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={settings.queue.showPosition} disabled={!canManage || !settings.queue.enabled} onChange={e => update({ queue: { ...settings.queue, showPosition: e.target.checked } })} />Mostrar a posição na fila (ex.: “Você é o 2º na fila”)</label>
        <p className="text-[11px] text-slate-400">O horário da equipe vem de Agente de IA › Atendimento humano e transferência.</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
        <Row title="Respostas rápidas" text={`Até ${MAX_QUICK_REPLIES} botões que enviam uma mensagem pronta, como “Ver planos” ou “Suporte técnico”.`}><span className="text-xs font-semibold text-slate-400">{quick.length}/{MAX_QUICK_REPLIES}</span></Row>
        {quick.map((item, index) => <div key={index} className="grid gap-2 rounded-xl bg-[#FAFBFD] p-3 sm:grid-cols-[150px_1fr_auto]">
          <input aria-label={`Texto do botão ${index + 1}`} placeholder="Texto do botão" value={item.label} maxLength={MAX_BUTTON_LABEL} disabled={!canManage} onChange={e => setQuick(index, { label: e.target.value, ...(!item.text || item.text === item.label ? { text: e.target.value } : {}) })} className={field} />
          <input aria-label={`Mensagem enviada pelo botão ${index + 1}`} placeholder="Mensagem enviada (opcional)" value={item.text === item.label ? '' : item.text} maxLength={MAX_QUICK_TEXT} disabled={!canManage} onChange={e => setQuick(index, { text: e.target.value || item.label })} className={field} />
          <button type="button" disabled={!canManage} onClick={() => update({ quickReplies: quick.filter((_, i) => i !== index) })} aria-label={`Remover botão ${index + 1}`} className="rounded-xl p-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 size={16} /></button>
        </div>)}
        {canManage && quick.length < MAX_QUICK_REPLIES && <button type="button" onClick={() => update({ quickReplies: [...quick, { label: '', text: '' }] })} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-[#004751] hover:bg-slate-50"><Plus size={14} />Adicionar resposta rápida</button>}
      </div>
    </div>

    {canManage && <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#003B44] disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />}Salvar botões e fila</button>
      {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-xs text-emerald-700' : 'text-xs text-rose-600'}>{message.text}</p>}
    </div>}
  </div>;
}
