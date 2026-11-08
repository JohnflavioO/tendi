'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Send, MessageCircle, Users, KanbanSquare, ChartNoAxesCombined, Settings, Inbox, Bot, ChevronDown, Phone, Info, CheckCheck, Plus, Loader2, Building2, X, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Org = { id: string; name: string };
type Contact = { id: string; full_name: string; phone_e164: string | null; email: string | null; tags: string[]; opt_in: boolean };
type Team = { id: string; name: string; color: string };
type Conversation = { id: string; organization_id: string; contact_id: string; team_id: string | null; assigned_to: string | null; channel: string; status: string; unread_count: number; last_message_at: string | null; contacts: Contact | null; teams: Team | null };
type Message = { id: string; conversation_id: string; direction: 'inbound' | 'outbound' | 'internal'; message_type: string; body: string | null; created_at: string; delivery_status: string; sender_id: string | null };

const nav = [['Inbox', Inbox, '/inbox'], ['CRM', KanbanSquare, '/crm'], ['Contatos', Users, '/contatos'], ['Chatbots', Bot, '/chatbots'], ['Relatórios', ChartNoAxesCombined, '/relatorios'], ['Configurações', Settings, '/configuracoes']] as const;
const time = (value?: string | null) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const initials = (value?: string | null) => (value || 'C').split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();

export default function InboxPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState('');
  const [organizations, setOrganizations] = useState<Org[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState('Todas');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(true);

  const loadOrganizations = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { window.location.assign('/login'); return; }
    setUserId(auth.user.id);
    const { data, error: orgError } = await supabase.from('organizations').select('id,name').order('name');
    if (orgError) throw orgError;
    const list = (data ?? []) as Org[];
    setOrganizations(list);
    if (!organizationId && list[0]) setOrganizationId(list[0].id);
    setLoading(false);
  }, [supabase, organizationId]);

  const loadInbox = useCallback(async () => {
    if (!organizationId) { setConversations([]); setMessages([]); return; }
    setError('');
    const { data, error: conversationError } = await supabase
      .from('conversations')
      .select('id,organization_id,contact_id,team_id,assigned_to,channel,status,unread_count,last_message_at,contacts(id,full_name,phone_e164,email,tags,opt_in),teams(id,name,color)')
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (conversationError) throw conversationError;
    const rows = (data ?? []) as unknown as Conversation[];
    setConversations(rows);
    if (!selectedId || !rows.some(row => row.id === selectedId)) setSelectedId(rows[0]?.id ?? '');
    const ids = rows.map(row => row.id);
    if (!ids.length) { setMessages([]); return; }
    const { data: messageRows, error: messageError } = await supabase
      .from('messages')
      .select('id,conversation_id,direction,message_type,body,created_at,delivery_status,sender_id')
      .in('conversation_id', ids)
      .order('created_at', { ascending: true });
    if (messageError) throw messageError;
    setMessages((messageRows ?? []) as Message[]);
  }, [organizationId, selectedId, supabase]);

  useEffect(() => { void loadOrganizations().catch(err => { setError(err.message); setLoading(false); }); }, [loadOrganizations]);
  useEffect(() => { if (organizationId) void loadInbox().catch(err => setError(err.message)); }, [organizationId, loadInbox]);
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase.channel(`tendi-inbox-${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `organization_id=eq.${organizationId}` }, () => { void loadInbox(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `organization_id=eq.${organizationId}` }, () => { void loadInbox(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [organizationId, loadInbox, supabase]);

  const selected = conversations.find(item => item.id === selectedId) ?? null;
  const contact = selected?.contacts ?? null;
  const thread = messages.filter(message => message.conversation_id === selectedId);
  const filtered = useMemo(() => conversations.filter(item => {
    const name = item.contacts?.full_name?.toLowerCase() ?? '';
    const matchesSearch = name.includes(search.toLowerCase());
    const matchesFilter = filter === 'Todas' || (filter === 'Não lidas' ? item.unread_count > 0 : item.status === filter);
    return matchesSearch && matchesFilter;
  }), [conversations, filter, search]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft.trim() || !userId) return;
    setSending(true); setError('');
    try {
      const now = new Date().toISOString();
      const { error: insertError } = await supabase.from('messages').insert({
        organization_id: organizationId,
        conversation_id: selected.id,
        direction: 'outbound',
        message_type: 'text',
        body: draft.trim(),
        delivery_status: 'queued',
        sender_id: userId,
        sent_at: now,
      });
      if (insertError) throw insertError;
      const { error: updateError } = await supabase.from('conversations').update({ last_message_at: now, status: 'open' }).eq('id', selected.id);
      if (updateError) throw updateError;
      setDraft('');
      await loadInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F7F8FC] text-[#2F316B]"><Loader2 className="animate-spin" /></main>;

  if (!organizations.length) return <main className="grid min-h-screen place-items-center bg-[#F7F8FC] p-6"><div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Building2 className="mx-auto text-[#CB0A9F]" size={34}/><h1 className="mt-4 text-xl font-bold text-[#2F316B]">Nenhuma empresa vinculada</h1><p className="mt-2 text-sm leading-6 text-slate-500">Sua conta ainda não pertence a uma organização. Peça ao Super Admin para criar uma empresa e associar seu usuário.</p><form action="/auth/signout" method="post"><button className="mt-5 rounded-xl bg-[#004751] px-4 py-2.5 text-sm font-semibold text-white">Sair</button></form></div></main>;

  return <main className="flex min-h-screen bg-[#F7F8FC] text-slate-800">
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
      <div className="mb-8 flex items-center gap-3 px-2"><span className="rounded-xl bg-[#edf0fb] p-2.5 text-[#2F316B]"><MessageCircle/></span><span className="text-xl font-bold text-[#2F316B]">Tendi</span></div>
      <label className="mb-6 block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</span><div className="relative"><select value={organizationId} onChange={e=>setOrganizationId(e.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white p-3 pr-8 text-sm font-semibold outline-none focus:border-[#004751]">{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={16}/></div></label>
      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p><nav className="space-y-1">{nav.map(([label,Icon,url])=><a key={label} href={url} className={label==='Inbox'?'flex items-center gap-3 rounded-xl bg-[#edf0fb] px-3 py-3 text-sm font-semibold text-[#2F316B]':'flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-600 hover:bg-slate-50'}><Icon size={18}/>{label}{label==='Inbox'&&<span className="ml-auto rounded-full bg-[#CB0A9F] px-2 py-0.5 text-xs text-white">{conversations.length}</span>}</a>)}</nav>
      <div className="mt-auto space-y-3"><a href="/admin" className="flex items-center gap-2 px-3 text-xs font-semibold text-[#2F316B]"><ShieldCheckIcon/> Console Super Admin</a><form action="/auth/signout" method="post"><button className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-xs text-slate-500">Sair da conta</button></form></div>
    </aside>

    <section className="w-full shrink-0 border-r border-slate-200 bg-white md:w-[320px]">
      <header className="flex h-[76px] items-center justify-between border-b border-slate-100 px-5"><div><p className="text-lg font-semibold text-[#2F316B]">Inbox</p><p className="text-xs text-slate-400">{conversations.length} conversas · dados do banco</p></div><button onClick={()=>void loadInbox()} className="rounded-lg border border-slate-200 p-2 text-slate-500" title="Atualizar"><RefreshCw size={17}/></button></header>
      <div className="p-4"><div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><Search size={16} className="text-slate-400"/><input placeholder="Buscar contato..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none"/></div><div className="mt-4 flex gap-1 overflow-x-auto">{['Todas','Não lidas','open','pending','closed'].map(value=><button key={value} onClick={()=>setFilter(value)} className={filter===value?'whitespace-nowrap rounded-full bg-[#edf0fb] px-3 py-1.5 text-xs font-semibold text-[#2F316B]':'whitespace-nowrap rounded-full bg-slate-50 px-3 py-1.5 text-xs text-slate-500'}>{value==='open'?'Abertas':value==='pending'?'Pendentes':value==='closed'?'Encerradas':value}</button>)}</div></div>
      <div className="divide-y divide-slate-100">{filtered.map(item=><button key={item.id} onClick={()=>setSelectedId(item.id)} className={selectedId===item.id?'flex w-full gap-3 border-l-[3px] border-[#CB0A9F] bg-[#f8f7fc] px-4 py-4 text-left':'flex w-full gap-3 px-4 py-4 text-left hover:bg-slate-50'}><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf0fb] text-sm font-semibold text-[#2F316B]">{initials(item.contacts?.full_name)}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><b className="truncate text-sm">{item.contacts?.full_name ?? 'Contato'}</b><span className="text-[10px] text-slate-400">{time(item.last_message_at)}</span></div><p className="mt-1 truncate text-xs text-slate-500">{item.subject ?? item.channel}</p><div className="mt-2 flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{item.status}</span>{item.unread_count>0&&<span className="ml-auto rounded-full bg-[#CB0A9F] px-1.5 py-0.5 text-[10px] text-white">{item.unread_count}</span>}</div></div></button>)}</div>
      {!filtered.length&&<div className="p-8 text-center"><MessageCircle className="mx-auto text-slate-300" size={28}/><p className="mt-3 text-sm font-semibold text-slate-600">Nenhuma conversa encontrada</p><p className="mt-1 text-xs text-slate-400">As conversas reais desta empresa aparecerão aqui.</p></div>}
    </section>

    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#edf0fb] text-sm font-semibold text-[#2F316B]">{initials(contact?.full_name)}</div><div><p className="text-sm font-semibold">{contact?.full_name ?? 'Selecione uma conversa'}</p><p className="text-xs text-slate-400">{selected ? `${selected.channel} · ${selected.teams?.name ?? 'Sem equipe'}` : 'Inbox conectado ao Supabase'}</p></div></div><div className="flex items-center gap-3 text-slate-400"><button title="Ligar"><Phone size={18}/></button><button onClick={()=>setShowDetails(!showDetails)} title="Detalhes"><Info size={18}/></button></div></header>
      <div className="flex-1 space-y-4 overflow-y-auto p-5 md:p-8">{selected ? thread.map(message=><div key={message.id} className={message.direction==='inbound'?'flex justify-start':'flex justify-end'}><div className={message.direction==='inbound'?'max-w-[78%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm':'max-w-[78%] rounded-2xl rounded-tr-sm bg-[#edf0fb] px-4 py-3'}><p className="whitespace-pre-wrap text-sm leading-6">{message.body ?? `[${message.message_type}]`}</p><div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">{time(message.created_at)}{message.direction==='outbound'&&<CheckCheck size={13} className="text-[#004751]"/>}</div></div></div>) : <div className="grid h-full place-items-center text-center"><div><MessageCircle className="mx-auto text-slate-300" size={38}/><p className="mt-3 font-semibold text-slate-600">Selecione uma conversa</p><p className="mt-1 text-sm text-slate-400">O histórico será carregado do banco de dados.</p></div></div>}</div>
      {selected&&<form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-4"><div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2"><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Digite uma mensagem para registrar..." className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"/><button disabled={sending||!draft.trim()} className="rounded-lg bg-[#004751] p-2.5 text-white disabled:opacity-50">{sending?<Loader2 className="animate-spin" size={17}/>:<Send size={17}/>}</button></div><p className="mt-2 px-1 text-[10px] text-slate-400">A mensagem será persistida no Tendi com status na fila. O envio externo depende da conexão do canal.</p></form>}
      {error&&<div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
    </section>

    {showDetails&&selected&&<aside className="hidden w-[270px] shrink-0 border-l border-slate-200 bg-white xl:block"><div className="border-b border-slate-100 p-5"><div className="flex items-center justify-between"><b className="text-sm">Detalhes do contato</b><button onClick={()=>setShowDetails(false)}><X size={16}/></button></div><div className="mt-6 flex flex-col items-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#edf0fb] text-lg font-semibold text-[#2F316B]">{initials(contact?.full_name)}</div><p className="mt-3 font-semibold">{contact?.full_name}</p><p className="mt-1 text-xs text-slate-400">{contact?.phone_e164 ?? 'Sem telefone'}</p></div></div><div className="space-y-5 p-5"><div><p className="text-xs font-semibold text-slate-400">E-MAIL</p><p className="mt-1 break-all text-sm">{contact?.email ?? 'Não informado'}</p></div><div><p className="text-xs font-semibold text-slate-400">EQUIPE</p><p className="mt-1 text-sm">{selected.teams?.name ?? 'Não atribuída'}</p></div><div><p className="text-xs font-semibold text-slate-400">ETIQUETAS</p><div className="mt-2 flex flex-wrap gap-2">{(contact?.tags ?? []).map(tag=><span key={tag} className="rounded-full bg-[#edf0fb] px-2.5 py-1 text-xs text-[#2F316B]">{tag}</span>)}</div></div><div><p className="text-xs font-semibold text-slate-400">CONSENTIMENTO</p><p className="mt-1 text-sm">{contact?.opt_in?'Opt-in registrado':'Não registrado'}</p></div></div></aside>}
  </main>;
}

function ShieldCheckIcon() {
  return <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#CB0A9F] text-[10px] text-white">S</span>;
}
