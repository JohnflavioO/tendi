'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellPlus, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Recipient = 'me' | 'client' | 'team';
type Channel = 'push' | 'whatsapp' | 'both';
type Choice = { id: string; label: string };
type Reminder = { id: string; title: string; recipient_type: Recipient; channel: Channel; scheduled_at: string; status: string };

export function ScheduledRemindersCard({ organizationId }: { organizationId: string }) {
  const supabase = useMemo(() => createClient() as any, []);
  const [recipient, setRecipient] = useState<Recipient>('me');
  const [channel, setChannel] = useState<Channel>('push');
  const [recipientId, setRecipientId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [when, setWhen] = useState('');
  const [contacts, setContacts] = useState<Choice[]>([]);
  const [team, setTeam] = useState<Choice[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const [c, members, r] = await Promise.all([
        supabase.from('contacts').select('id,full_name').eq('organization_id', organizationId).order('full_name').limit(200),
        supabase.from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('status', 'active').limit(100),
        supabase.from('scheduled_reminders').select('id,title,recipient_type,channel,scheduled_at,status').eq('organization_id', organizationId).order('scheduled_at', { ascending: true }).limit(30),
      ]);
      if (!active) return;
      setContacts((c.data ?? []).map((x: {id:string;full_name:string}) => ({ id:x.id, label:x.full_name })));
      setTeam((members.data ?? []).map((x: {user_id:string}) => ({ id:x.user_id, label:x.user_id })));
      if (r.error) setNotice('A Central de Lembretes precisa da migration da PR #143 antes de ser utilizada.');
      else setReminders(r.data ?? []);
    }
    void load();
    return () => { active = false; };
  }, [organizationId, supabase]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const scheduledAt = new Date(when);
    if (!when || !Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) { setNotice('Escolha uma data e horário futuros.'); return; }
    if (recipient !== 'me' && !recipientId) { setNotice('Selecione o destinatário.'); return; }
    setBusy(true); setNotice('');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setNotice('Faça login novamente.'); setBusy(false); return; }
    const payload = {
      organization_id: organizationId, created_by: auth.user.id,
      recipient_type: recipient, recipient_user_id: recipient === 'me' ? auth.user.id : recipient === 'team' ? recipientId : null,
      contact_id: recipient === 'client' ? recipientId : null,
      channel, title: title.trim(), message: message.trim(), scheduled_at: scheduledAt.toISOString(),
    };
    const { data, error } = await supabase.from('scheduled_reminders').insert(payload).select('id,title,recipient_type,channel,scheduled_at,status').single();
    setBusy(false);
    if (error) { setNotice('Não foi possível salvar: ' + error.message); return; }
    setReminders(current => [...current, data].sort((a,b) => a.scheduled_at.localeCompare(b.scheduled_at)));
    setTitle(''); setMessage(''); setWhen('');
    setNotice('Lembrete registrado. O disparo automático ainda não está ativado nesta etapa.');
  }

  return <section className="td-card min-w-0 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="td-icon td-icon-teal"><BellPlus size={18}/></span>
      <div><h2 className="td-title text-base">Alertas personalizados</h2>
        <p className="mt-1 text-sm text-slate-500">Escolha destinatário, canal, dia e horário. Nesta primeira etapa os lembretes são salvos, mas ainda não são enviados automaticamente.</p>
      </div>
    </div>
    <form onSubmit={event => void save(event)} className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-xs font-semibold text-slate-600">Destinatário
        <select className="td-input mt-1 w-full text-base sm:text-sm" value={recipient} onChange={event => { setRecipient(event.target.value as Recipient); setRecipientId(''); }}>
          <option value="me">Para mim</option><option value="client">Cliente</option><option value="team">Equipe</option>
        </select>
      </label>
      {recipient !== 'me' && <label className="min-w-0 text-xs font-semibold text-slate-600">{recipient === 'client' ? 'Cliente' : 'Membro da equipe'}
        <select required className="td-input mt-1 w-full text-base sm:text-sm" value={recipientId} onChange={event => setRecipientId(event.target.value)}>
          <option value="">Selecione...</option>{(recipient === 'client' ? contacts : team).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>}
      <label className="min-w-0 text-xs font-semibold text-slate-600">Canal
        <select className="td-input mt-1 w-full text-base sm:text-sm" value={channel} onChange={event => setChannel(event.target.value as Channel)}>
          <option value="push">Notificação no app</option><option value="whatsapp">WhatsApp</option><option value="both">App e WhatsApp</option>
        </select>
      </label>
      <label className="min-w-0 text-xs font-semibold text-slate-600">Data e horário
        <input required type="datetime-local" className="td-input mt-1 w-full min-w-0 text-base sm:text-sm" value={when} onChange={event => setWhen(event.target.value)}/>
      </label>
      <label className="min-w-0 text-xs font-semibold text-slate-600 sm:col-span-2">Título
        <input required maxLength={120} className="td-input mt-1 w-full text-base sm:text-sm" value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Cobrar hospedagem"/>
      </label>
      <label className="min-w-0 text-xs font-semibold text-slate-600 sm:col-span-2">Mensagem
        <textarea required maxLength={2000} rows={3} className="td-input mt-1 w-full text-base sm:text-sm" value={message} onChange={event => setMessage(event.target.value)} placeholder="O que precisa ser lembrado?"/>
      </label>
      <div className="sm:col-span-2"><button disabled={busy} className="td-btn td-btn-teal min-h-11 w-full justify-center sm:w-auto">{busy && <Loader2 size={15} className="animate-spin"/>}Salvar lembrete</button></div>
    </form>
    {notice && <p role="status" className="mt-3 rounded-xl bg-tendi-haze px-3 py-2 text-sm text-slate-700">{notice}</p>}
    <div className="mt-6 border-t border-tendi-line pt-4"><h3 className="text-sm font-semibold text-tendi-navy">Lembretes cadastrados</h3>
      {!reminders.length ? <p className="mt-2 text-sm text-slate-400">Nenhum lembrete cadastrado.</p> :
      <ul className="mt-2 divide-y divide-tendi-line">{reminders.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <div className="min-w-0"><p className="break-words font-semibold text-tendi-navy">{item.title}</p><p className="text-xs text-slate-500">{new Date(item.scheduled_at).toLocaleString('pt-BR')} · {item.channel === 'both' ? 'App e WhatsApp' : item.channel === 'push' ? 'App' : 'WhatsApp'}</p></div>
        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">{item.status === 'scheduled' ? 'Aguardando ativação do disparo' : item.status}</span>
      </li>)}</ul>}
    </div>
  </section>;
}
