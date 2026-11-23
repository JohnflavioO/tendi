'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellPlus, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Recipient = 'me' | 'client' | 'team';
type Channel = 'push' | 'whatsapp' | 'both';
type Choice = { id: string; label: string };
type Reminder = { id: string; title: string; message: string; recipient_type: Recipient; recipient_user_id: string | null; contact_id: string | null; channel: Channel; scheduled_at: string; status: string; push_status: string; whatsapp_status: string; last_error: string | null };

export function ScheduledRemindersCard({ organizationId }: { organizationId: string }) {
  const supabase = useMemo(() => createClient() as any, []);
  const [recipient, setRecipient] = useState<Recipient>('me');
  const [channel, setChannel] = useState<Channel>('push');
  const [recipientId, setRecipientId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [when, setWhen] = useState('');
  const [contacts, setContacts] = useState<Choice[]>([]);
  const [whatsAppEligible, setWhatsAppEligible] = useState<Set<string>>(new Set());
  const [whatsAppConnected, setWhatsAppConnected] = useState(false);
  const [team, setTeam] = useState<Choice[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('reminder');
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setHighlightId(id);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const [c, members, r, connection] = await Promise.all([
        supabase.from('contacts').select('id,full_name,phone_e164,opt_in').eq('organization_id', organizationId).order('full_name').limit(200),
        supabase.from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('status', 'active').limit(100),
        supabase.from('scheduled_reminders').select('id,title,message,recipient_type,recipient_user_id,contact_id,channel,scheduled_at,status,push_status,whatsapp_status,last_error').eq('organization_id', organizationId).order('scheduled_at', { ascending: true }).limit(30),
        supabase.from('channel_connections').select('id,status').eq('organization_id', organizationId).eq('channel', 'whatsapp').eq('status', 'connected').limit(1),
      ]);
      if (!active) return;
      setContacts((c.data ?? []).map((x: {id:string;full_name:string;phone_e164:string|null;opt_in:boolean}) => ({ id:x.id, label:x.full_name || 'Cliente sem nome' })));
      setWhatsAppEligible(new Set((c.data ?? []).filter((x: {phone_e164:string|null;opt_in:boolean}) => x.opt_in && /^\\d{10,15}$/.test(String(x.phone_e164 ?? '').replace(/\\D/g, ''))).map((x: {id:string}) => x.id)));
      setWhatsAppConnected(Boolean(connection.data?.length));
      setTeam((members.data ?? []).map((x: {user_id:string}) => ({ id:x.user_id, label:x.user_id })));
      if (r.error) setNotice('A Central de Lembretes precisa da migration da PR #143 antes de ser utilizada.');
      else setReminders(r.data ?? []);
    }
    void load();
    return () => { active = false; };
  }, [organizationId, supabase]);

  useEffect(() => {
    if (!highlightId || !reminders.some(item => item.id === highlightId)) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(`reminder-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return () => window.cancelAnimationFrame(frame);
  }, [highlightId, reminders]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const scheduledAt = new Date(when);
    if (!when || !Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) { setNotice('Escolha uma data e horário futuros.'); return; }
    if (recipient !== 'me' && !recipientId) { setNotice('Selecione o destinatário.'); return; }
    if (channel !== 'push' && recipient !== 'client') { setNotice('WhatsApp para mim/equipe ainda não está disponível. Escolha Notificação no app.'); return; }
    if (channel !== 'push' && !whatsAppConnected) { setNotice('Conecte o WhatsApp da empresa antes de agendar este envio.'); return; }
    if (channel !== 'push' && !whatsAppEligible.has(recipientId)) { setNotice('O cliente precisa ter número válido e autorização de contato para receber WhatsApp.'); return; }
    setBusy(true); setNotice('');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setNotice('Faça login novamente.'); setBusy(false); return; }
    const payload = {
      organization_id: organizationId, created_by: auth.user.id,
      recipient_type: recipient, recipient_user_id: recipient === 'me' ? auth.user.id : recipient === 'team' ? recipientId : null,
      contact_id: recipient === 'client' ? recipientId : null,
      channel, title: title.trim(), message: message.trim(), scheduled_at: scheduledAt.toISOString(),
    };
    const fields = 'id,title,message,recipient_type,recipient_user_id,contact_id,channel,scheduled_at,status,push_status,whatsapp_status,last_error';
    const query = editingId
      ? supabase.from('scheduled_reminders').update({
          recipient_type: payload.recipient_type, recipient_user_id: payload.recipient_user_id,
          contact_id: payload.contact_id, channel: payload.channel,
          title: payload.title, message: payload.message, scheduled_at: payload.scheduled_at,
          updated_at: new Date().toISOString(),
        }).eq('id', editingId).eq('organization_id', organizationId).eq('status', 'scheduled')
      : supabase.from('scheduled_reminders').insert(payload);
    const { data, error } = await query.select(fields).single();
    setBusy(false);
    if (error) { setNotice('Não foi possível salvar: ' + error.message); return; }
    setReminders(current => [...current.filter(item => item.id !== data.id), data].sort((a,b) => a.scheduled_at.localeCompare(b.scheduled_at)));
    setTitle(''); setMessage(''); setWhen(''); setEditingId(null);
    setNotice(editingId ? 'Lembrete atualizado.' : 'Lembrete agendado. WhatsApp exige cliente autorizado e conexão ativa.');
  }

  function startEdit(item: Reminder) {
    if (item.status !== 'scheduled') return;
    setEditingId(item.id);
    setRecipient(item.recipient_type);
    setRecipientId(item.recipient_type === 'client' ? item.contact_id ?? '' : item.recipient_user_id ?? '');
    setChannel(item.channel);
    setTitle(item.title);
    setMessage(item.message);
    const date = new Date(item.scheduled_at);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    setWhen(local.toISOString().slice(0, 16));
    setNotice('Editando lembrete. Escolha um horário futuro e salve as alterações.');
    document.getElementById('scheduled-reminder-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditingId(null); setTitle(''); setMessage(''); setWhen(''); setRecipient('me'); setRecipientId(''); setChannel('push'); setNotice('');
  }

  async function remove(item: Reminder) {
    if (item.status === 'processing') return;
    if (!window.confirm(`Excluir o lembrete "${item.title}"? Esta ação não pode ser desfeita.`)) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.from('scheduled_reminders').delete()
      .eq('id', item.id).eq('organization_id', organizationId).neq('status', 'processing');
    setBusy(false);
    if (error) { setNotice('Não foi possível excluir: ' + error.message); return; }
    setReminders(current => current.filter(row => row.id !== item.id));
    if (editingId === item.id) cancelEdit();
    setNotice('Lembrete excluído.');
  }

  return <section className="td-card min-w-0 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="td-icon td-icon-teal"><BellPlus size={18}/></span>
      <div><h2 className="td-title text-base">Alertas personalizados</h2>
        <p className="mt-1 text-sm text-slate-500">Escolha destinatário, canal, dia e horário. Notificações no app são processadas pelo agendador (até 10 minutos de intervalo). WhatsApp disponível para clientes com número válido, autorização de contato e conexão ativa. Para mim/equipe, use notificações no app. O processamento ocorre aproximadamente a cada minuto.</p>
      </div>
    </div>
    <form id="scheduled-reminder-form" onSubmit={event => void save(event)} className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-sm font-semibold text-slate-700">Destinatário
        <select className="td-input mt-1 w-full text-base sm:text-sm" value={recipient} onChange={event => { setRecipient(event.target.value as Recipient); setRecipientId(''); if (event.target.value !== 'client') setChannel('push'); }}>
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
          <option value="push">Notificação no app</option>{recipient === 'client' && <option value="whatsapp">WhatsApp</option>}{recipient === 'client' && <option value="both">App e WhatsApp (push exige conta do cliente)</option>}
        </select>
      </label>
      {recipient === 'client' && channel !== 'push' && <p className="sm:col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{!whatsAppConnected ? 'WhatsApp desconectado: conecte o canal antes de salvar.' : !whatsAppEligible.has(recipientId) ? 'Selecione um cliente com número válido e autorização de contato.' : 'WhatsApp habilitado para este cliente. O status Enviado confirma aceite pela integração, não entrega ou leitura.'}{channel === 'both' && ' Clientes sem acesso ao aplicativo não recebem push; use apenas WhatsApp nesse caso.'}</p>}
      <label className="min-w-0 text-xs font-semibold text-slate-600">Data e horário
        <input required type="datetime-local" className="td-input mt-1 w-full min-w-0 text-base sm:text-sm" value={when} onChange={event => setWhen(event.target.value)}/>
      </label>
      <label className="min-w-0 text-xs font-semibold text-slate-600 sm:col-span-2">Título
        <input required maxLength={120} className="td-input mt-1 w-full text-base sm:text-sm" value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Cobrar hospedagem"/>
      </label>
      <label className="min-w-0 text-xs font-semibold text-slate-600 sm:col-span-2">Mensagem
        <textarea required maxLength={2000} rows={3} className="td-input mt-1 w-full text-base sm:text-sm" value={message} onChange={event => setMessage(event.target.value)} placeholder="O que precisa ser lembrado?"/>
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={busy} className="td-btn td-btn-teal min-h-11 justify-center">{busy && <Loader2 size={15} className="animate-spin"/>}{editingId ? 'Salvar alterações' : 'Salvar lembrete'}</button>{editingId && <button type="button" onClick={cancelEdit} className="td-btn td-btn-secondary min-h-11"><X size={15}/>Cancelar edição</button>}</div>
    </form>
    {notice && <p role="status" className="mt-3 rounded-xl bg-tendi-haze px-3 py-2 text-sm text-slate-700">{notice}</p>}
    <div className="mt-6 border-t border-tendi-line pt-4"><h3 className="text-sm font-semibold text-tendi-navy">Lembretes cadastrados</h3>
      {!reminders.length ? <p className="mt-2 text-sm text-slate-400">Nenhum lembrete cadastrado.</p> :
      <ul className="mt-2 divide-y divide-tendi-line">{reminders.map(item => <li id={`reminder-${item.id}`} key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl py-3 text-sm ${highlightId === item.id ? 'bg-tendi-mist px-3 ring-2 ring-tendi-indigo/30' : ''}`}>
        <div className="min-w-0 flex-1"><p className="break-words font-semibold text-tendi-navy">{item.title}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{item.message}</p>
          <p className="mt-1 text-sm text-slate-600">{new Date(item.scheduled_at).toLocaleString('pt-BR')} · {item.channel === 'both' ? 'App e WhatsApp' : item.channel === 'push' ? 'App' : 'WhatsApp'}</p>
          <p className="mt-1 text-sm text-slate-600">{item.channel !== 'whatsapp' && `App: ${item.push_status === 'sent' ? 'Aceito pelo Firebase' : item.push_status === 'failed' ? 'Falhou' : item.push_status === 'skipped' ? 'Não aplicável' : 'Pendente'}`}{item.channel === 'both' && ' · '}{item.channel !== 'push' && `WhatsApp: ${item.whatsapp_status === 'sent' ? 'Aceito pela integração' : item.whatsapp_status === 'failed' ? 'Falhou' : item.whatsapp_status === 'skipped' ? 'Não aplicável' : 'Pendente'}`}</p>
          {item.last_error && <p className="mt-1 text-sm text-red-700">{item.last_error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">{item.status === 'scheduled' ? 'Agendado' : item.status === 'sent' ? 'Enviado' : item.status === 'partial' ? 'Parcial' : item.status === 'failed' ? 'Falhou' : item.status === 'processing' ? 'Processando' : item.status}</span>
          {item.status === 'scheduled' && <button type="button" disabled={busy} onClick={() => startEdit(item)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-tendi-line px-3 text-sm font-semibold text-tendi-navy hover:bg-tendi-haze"><Pencil size={14}/>Editar</button>}
          {item.status !== 'processing' && <button type="button" disabled={busy} onClick={() => void remove(item)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-100 px-3 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 size={14}/>Excluir</button>}
        </div>
      </li>)}</ul>}
    </div>
  </section>;
}
