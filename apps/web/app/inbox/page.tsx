'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, Send, ArrowLeft, MessageCircle, Users, KanbanSquare, ChartNoAxesCombined,
  Settings, Inbox, Bot, ChevronDown, Phone, Info, CheckCheck, Loader2,
  Building2, X, RefreshCw, SlidersHorizontal, Sparkles, Paperclip,
  Smile, MoreHorizontal, Clock3, CircleCheck, UserRound, PanelRightClose,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Org = { id: string; name: string };
type Contact = { id: string; full_name: string; phone_e164: string | null; email: string | null; tags: string[]; opt_in: boolean };
type Team = { id: string; name: string; color: string };
type Conversation = { id: string; organization_id: string; contact_id: string; team_id: string | null; assigned_to: string | null; channel: string; status: string; unread_count: number; last_message_at: string | null; contacts: Contact | null; teams: Team | null };
type Message = { id: string; conversation_id: string; direction: 'inbound' | 'outbound' | 'internal'; message_type: string; body: string | null; created_at: string; delivery_status: string; sender_id: string | null };

const nav = [
  ['Inbox', Inbox, '/inbox'],
  ['CRM', KanbanSquare, '/crm'],
  ['Contatos', Users, '/contatos'],
  ['Chatbots', Bot, '/chatbots'],
  ['Relatórios', ChartNoAxesCombined, '/relatorios'],
  ['Configurações', Settings, '/configuracoes'],
] as const;
const time = (value?: string | null) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const initials = (value?: string | null) => (value || 'C').split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';

export default function InboxPage() {
  const supabase = createClient() as any;
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
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);

  const loadOrganizations = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { window.location.assign('/login'); return; }
    setUserId(auth.user.id);
    const { data, error: orgError } = await supabase.from('organizations').select('id,name').order('name');
    if (orgError) throw orgError;
    const list = (data ?? []) as Org[];
    setOrganizations(list);
    const requestedId = new URLSearchParams(window.location.search).get('organization');
    const requestedOrganization = requestedId && list.some(org => org.id === requestedId) ? requestedId : '';
    setOrganizationId(current => current || requestedOrganization || list[0]?.id || '');
    setLoading(false);
  }, [supabase]);

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
    setSelectedId(current => current && rows.some(row => row.id === current) ? current : (rows[0]?.id ?? ''));
    const ids = rows.map(row => row.id);
    if (!ids.length) { setMessages([]); return; }
    const { data: messageRows, error: messageError } = await supabase
      .from('messages')
      .select('id,conversation_id,direction,message_type,body,created_at,delivery_status,sender_id')
      .in('conversation_id', ids)
      .order('created_at', { ascending: true });
    if (messageError) throw messageError;
    setMessages((messageRows ?? []) as Message[]);
  }, [organizationId, supabase]);

  useEffect(() => { void loadOrganizations().catch(err => { setError(err.message); setLoading(false); }); }, [loadOrganizations]);
  useEffect(() => { if (organizationId) void loadInbox().catch(err => setError(err.message)); }, [organizationId, loadInbox]);
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase.channel(`tendi-inbox-\${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `organization_id=eq.\${organizationId}` }, () => { void loadInbox(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `organization_id=eq.\${organizationId}` }, () => { void loadInbox(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [organizationId, loadInbox, supabase]);

  const selected = conversations.find(item => item.id === selectedId) ?? null;
  const contact = selected?.contacts ?? null;
  const thread = messages.filter(message => message.conversation_id === selectedId);
  const unreadCount = conversations.filter(item => item.unread_count > 0).length;
  const openCount = conversations.filter(item => item.status === 'open').length;
  const filtered = useMemo(() => conversations.filter(item => {
    const name = item.contacts?.full_name?.toLowerCase() ?? '';
    const phone = item.contacts?.phone_e164 ?? '';
    const matchesSearch = name.includes(search.toLowerCase()) || phone.includes(search);
    const matchesFilter = filter === 'Todas'
      || (filter === 'Não lidas' ? item.unread_count > 0 : filter === 'Minhas' ? item.assigned_to === userId : item.status === filter);
    return matchesSearch && matchesFilter;
  }), [conversations, filter, search, userId]);
  const latestMessage = (conversationId: string) => { const rows = messages.filter(message => message.conversation_id === conversationId); return rows[rows.length - 1]; };

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft.trim() || !userId) return;
    setSending(true); setError('');
    try {
      const now = new Date().toISOString();
      const { error: insertError } = await supabase.from('messages').insert({
        organization_id: organizationId, conversation_id: selected.id, direction: 'outbound',
        message_type: 'text', body: draft.trim(), delivery_status: 'queued', sender_id: userId, sent_at: now,
      });
      if (insertError) throw insertError;
      const { error: updateError } = await supabase.from('conversations').update({ last_message_at: now, status: 'open' }).eq('id', selected.id);
      if (updateError) throw updateError;
      setDraft('');
      await loadInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a mensagem.');
    } finally { setSending(false); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] text-[#2F316B]"><Loader2 className="animate-spin" /></main>;
  if (!organizations.length) return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] p-6"><div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Building2 className="mx-auto text-[#CB0A9F]" size={34}/><h1 className="mt-4 text-xl font-bold text-[#2F316B]">Nenhuma empresa vinculada</h1><p className="mt-2 text-sm leading-6 text-slate-500">Sua conta ainda não pertence a uma organização. Peça ao Super Admin para criar uma empresa e associar seu usuário.</p><form action="/auth/signout" method="post"><button className="mt-5 rounded-xl bg-[#004751] px-4 py-2.5 text-sm font-semibold text-white">Sair</button></form></div></main>;

  return <main className="flex h-screen min-h-[620px] overflow-hidden bg-[#F4F6FB] text-slate-800">
    <aside className="hidden w-[218px] shrink-0 flex-col border-r border-slate-200/80 bg-white px-3 py-5 lg:flex">
      <div className="mb-8 flex items-center px-3"><img src="/brand/Logo%20Tendi.png" alt="Tendi" width="797" height="304" className="h-9 w-auto object-contain"/></div>
      <label className="mb-7 block px-2"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</span><div className="relative"><select value={organizationId} onChange={e=>setOrganizationId(e.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-[#FAFBFD] p-3 pr-8 text-sm font-semibold text-[#2F316B] outline-none focus:border-[#004751]">{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={16}/></div></label>
      <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</p>
      <nav className="space-y-1">{nav.map(([label,Icon,url])=><a key={label} href={url} className={label==='Inbox'?'group flex items-center gap-3 rounded-xl bg-[#F0F0FA] px-3 py-3 text-sm font-semibold text-[#2F316B] shadow-sm shadow-indigo-950/[.03]':'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500 transition hover:bg-slate-50 hover:text-[#2F316B]'}><Icon size={18}/>{label}{label==='Inbox'&&<span className="ml-auto rounded-full bg-[#CB0A9F] px-2 py-0.5 text-[10px] font-bold text-white">{conversations.length}</span>}</a>)}</nav>
      <div className="mt-auto space-y-3 px-2"><a href="/admin" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-[#2F316B] hover:bg-slate-50"><span className="flex size-5 items-center justify-center rounded-full bg-[#CB0A9F] text-[10px] text-white">S</span> Console Super Admin</a><form action="/auth/signout" method="post"><button className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-500 transition hover:bg-slate-50">Sair da conta</button></form></div>
    </aside>

    <section className={selectedId ? "hidden w-full shrink-0 flex-col border-r border-slate-200/80 bg-white md:flex md:w-[350px]" : "flex w-full shrink-0 flex-col border-r border-slate-200/80 bg-white md:w-[350px]"}>
      <header className="border-b border-slate-100 px-5 pb-4 pt-5"><div className="flex items-start justify-between"><div><p className="text-xl font-bold tracking-tight text-[#25275B]">Atendimento</p><p className="mt-1 text-xs text-slate-400">{conversations.length} conversas · {unreadCount} não lidas</p></div><button onClick={()=>void loadInbox()} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:border-[#CB0A9F]/30 hover:bg-[#FCF5FA] hover:text-[#CB0A9F]" title="Atualizar"><RefreshCw size={16}/></button></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#F5F6FB] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Abertas</p><p className="mt-0.5 text-lg font-bold text-[#2F316B]">{openCount}</p></div><div className="rounded-xl bg-[#FDF2FA] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#B70A90]">Não lidas</p><p className="mt-0.5 text-lg font-bold text-[#CB0A9F]">{unreadCount}</p></div></div>
      </header>
      <div className="px-4 pb-3 pt-4"><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-3 transition focus-within:border-[#7C7EC0] focus-within:ring-2 focus-within:ring-[#2F316B]/5"><Search size={16} className="shrink-0 text-slate-400"/><input placeholder="Buscar nome ou telefone..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"/><SlidersHorizontal size={15} className="text-slate-400"/></div>
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">{['Todas','Minhas','Não lidas','open','pending','closed'].map(value=><button key={value} onClick={()=>setFilter(value)} className={filter===value?'whitespace-nowrap rounded-lg bg-[#2F316B] px-3 py-2 text-[11px] font-semibold text-white shadow-sm':'whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100'}>{value==='open'?'Abertas':value==='pending'?'Pendentes':value==='closed'?'Encerradas':value}</button>)}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{filtered.map(item=>{const last=latestMessage(item.id);return <button key={item.id} onClick={()=>setSelectedId(item.id)} className={selectedId===item.id?'relative flex w-full gap-3 border-b border-slate-100 bg-[#F6F5FC] px-4 py-4 text-left':'flex w-full gap-3 border-b border-slate-100/80 px-4 py-4 text-left transition hover:bg-slate-50'}>
        {selectedId===item.id&&<span className="absolute inset-y-0 left-0 w-[3px] bg-[#CB0A9F]"/>}
        <div className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E9EAF8] to-[#F9E8F5] text-xs font-bold text-[#2F316B]">{initials(item.contacts?.full_name)}{item.unread_count>0&&<span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-white bg-[#CB0A9F]"/>}</div>
        <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><b className="truncate text-[13px] font-semibold text-slate-800">{item.contacts?.full_name??'Contato'}</b><span className="shrink-0 text-[10px] text-slate-400">{time(item.last_message_at)||dateLabel(item.last_message_at)}</span></div><p className="mt-1 truncate text-xs text-slate-500">{last?.body??item.channel}</p><div className="mt-2 flex items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-medium capitalize text-slate-500">{item.teams?.name??item.channel}</span>{item.unread_count>0&&<span className="ml-auto rounded-full bg-[#CB0A9F] px-2 py-0.5 text-[10px] font-bold text-white">{item.unread_count}</span>}</div></div>
      </button>})}
      {!filtered.length&&<div className="px-6 py-12 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#F3F4FA] text-slate-400"><MessageCircle size={22}/></div><p className="mt-4 text-sm font-semibold text-slate-700">Nenhuma conversa encontrada</p><p className="mt-1 text-xs leading-5 text-slate-400">Quando houver novos atendimentos, eles aparecerão aqui.</p></div>}</div>
      <div className="border-t border-slate-100 px-4 py-3 text-[10px] text-slate-400">Atualização em tempo real · Workspace ativo</div>
    </section>

    <section className={selectedId ? "flex min-w-0 flex-1 flex-col bg-[#F7F8FC]" : "hidden min-w-0 flex-1 flex-col bg-[#F7F8FC] md:flex"}>
      <header className="flex min-h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-5"><div className="flex min-w-0 items-center gap-3">{selected&&<button onClick={()=>setSelectedId("")} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 md:hidden" title="Voltar para conversas"><ArrowLeft size={18}/></button>}<div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E9EAF8] to-[#F9E8F5] text-xs font-bold text-[#2F316B]">{initials(contact?.full_name)}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-[#25275B]">{contact?.full_name??'Selecione uma conversa'}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{selected?(`\${selected.channel} · \${selected.teams?.name??'Sem equipe'}`):'Sua central de relacionamento'}</p></div></div>
        <div className="flex items-center gap-1 text-slate-400"><button className="rounded-lg p-2.5 transition hover:bg-slate-50 hover:text-[#004751]" title="Ligar"><Phone size={17}/></button><button onClick={()=>setShowDetails(!showDetails)} className="rounded-lg p-2.5 transition hover:bg-slate-50 hover:text-[#004751]" title="Detalhes"><Info size={17}/></button><div className="relative"><button onClick={()=>setConversationMenuOpen(v=>!v)} aria-label="Mais opções da conversa" aria-expanded={conversationMenuOpen} className="rounded-lg p-2.5 transition hover:bg-slate-50 hover:text-[#004751]" title="Mais opções"><MoreHorizontal size={18}/></button>{conversationMenuOpen&&<><button aria-label="Fechar opções" className="fixed inset-0 z-20 cursor-default" onClick={()=>setConversationMenuOpen(false)}/><div className="absolute right-0 top-11 z-30 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><a href="/contatos" className="block rounded-lg px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50">Abrir contatos</a><a href="/crm" className="block rounded-lg px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50">Abrir CRM</a><a href="/configuracoes" className="block rounded-lg px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50">Configurações</a><button onClick={()=>window.location.reload()} className="w-full rounded-lg px-3 py-2.5 text-left text-xs text-slate-600 hover:bg-slate-50">Atualizar Inbox</button><a href="mailto:suporte@tendi.app" className="block rounded-lg px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50">Ajuda e suporte</a></div></>}</div></div>
      </header>
      {selected?<><div className="flex items-center justify-between border-b border-slate-200/70 bg-white/70 px-5 py-2.5"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500"/><span className="text-[11px] font-medium text-slate-500">Atendimento em andamento</span></div><div className="flex items-center gap-2 text-[10px] text-slate-400"><Clock3 size={13}/> Última atividade {time(selected.last_message_at)||'—'}</div></div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-7 md:px-8">{thread.length?thread.map(message=><div key={message.id} className={message.direction==='inbound'?'flex justify-start':'flex justify-end'}><div className={message.direction==='internal'?'max-w-[78%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm':message.direction==='inbound'?'max-w-[78%] rounded-2xl rounded-tl-md border border-slate-100 bg-white px-4 py-3 shadow-[0_3px_12px_rgba(30,40,80,.04)]':'max-w-[78%] rounded-2xl rounded-tr-md bg-[#2F316B] px-4 py-3 text-white shadow-[0_5px_16px_rgba(47,49,107,.12)]'}>{message.direction==='internal'&&<p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Nota interna</p>}<p className="whitespace-pre-wrap text-[13px] leading-6">{message.body??`[\${message.message_type}]`}</p><div className={message.direction==='outbound'?'mt-1 flex items-center justify-end gap-1 text-[10px] text-white/60':'mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400'}>{time(message.created_at)}{message.direction==='outbound'&&<CheckCheck size={13}/>}</div></div></div>):<div className="grid h-full place-items-center text-center"><div><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-[#A6AAC5] shadow-sm"><MessageCircle size={26}/></div><p className="mt-4 text-sm font-semibold text-slate-600">Conversa sem mensagens</p><p className="mt-1 text-xs text-slate-400">As mensagens recebidas aparecerão neste espaço.</p></div></div>}</div>
        <form onSubmit={sendMessage} className="border-t border-slate-200/80 bg-white p-4 md:px-6"><div className="rounded-2xl border border-slate-200 bg-[#FBFCFE] p-3 shadow-[0_4px_18px_rgba(35,45,90,.04)] focus-within:border-[#A7A8D0]"><textarea value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Escreva sua mensagem..." rows={2} className="w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-6 outline-none placeholder:text-slate-400"/><div className="flex items-center justify-between border-t border-slate-100 pt-2"><div className="flex items-center gap-1 text-slate-400"><button type="button" className="rounded-lg p-2 hover:bg-slate-100" title="Anexos (em breve)"><Paperclip size={16}/></button><button type="button" className="rounded-lg p-2 hover:bg-slate-100" title="Emoji (em breve)"><Smile size={16}/></button><span className="ml-2 text-[10px]">Enter para enviar · Shift + Enter para nova linha</span></div><button disabled={sending||!draft.trim()} className="flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#003B44] disabled:cursor-not-allowed disabled:opacity-40">{sending?<Loader2 className="animate-spin" size={15}/>:<Send size={15}/>}Enviar</button></div></div><p className="mt-2 px-1 text-[10px] text-slate-400">Registro interno no Tendi. O envio externo depende da conexão ativa do canal.</p></form>
      </>:<div className="grid flex-1 place-items-center p-8 text-center"><div className="max-w-sm"><div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-white text-[#B0B5CF] shadow-sm"><MessageCircle size={30}/></div><p className="mt-5 text-base font-bold text-[#2F316B]">Seu atendimento começa aqui</p><p className="mt-2 text-sm leading-6 text-slate-400">Selecione uma conversa na lista para visualizar o histórico e continuar o relacionamento.</p><div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[10px] font-medium text-slate-500 shadow-sm"><Sparkles size={13} className="text-[#CB0A9F]"/> Central de atendimento Tendi</div></div></div>}
      {error&&<div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
    </section>

    {showDetails&&selected&&<aside className="hidden w-[280px] shrink-0 border-l border-slate-200/80 bg-white xl:block"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><b className="text-xs font-bold text-[#2F316B]">Contexto do contato</b><button onClick={()=>setShowDetails(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50"><PanelRightClose size={16}/></button></div><div className="border-b border-slate-100 px-5 py-6"><div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E9EAF8] to-[#F9E8F5] text-lg font-bold text-[#2F316B]">{initials(contact?.full_name)}</div><p className="mt-3 text-center text-sm font-bold text-[#25275B]">{contact?.full_name}</p><p className="mt-1 text-center text-xs text-slate-400">{contact?.phone_e164??'Sem telefone cadastrado'}</p><div className="mt-4 flex justify-center gap-2"><span className="rounded-lg bg-[#F1F2FA] px-3 py-2 text-[10px] font-semibold text-[#2F316B]"><UserRound size={12} className="mr-1 inline"/>Contato</span><span className="rounded-lg bg-[#F1F2FA] px-3 py-2 text-[10px] font-semibold text-[#2F316B]"><CircleCheck size={12} className="mr-1 inline"/>Perfil</span></div></div><div className="space-y-5 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">E-mail</p><p className="mt-1 break-all text-xs text-slate-700">{contact?.email??'Não informado'}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Equipe responsável</p><p className="mt-1 text-xs text-slate-700">{selected.teams?.name??'Não atribuída'}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Etiquetas</p><div className="mt-2 flex flex-wrap gap-1.5">{(contact?.tags??[]).length?(contact?.tags??[]).map(tag=><span key={tag} className="rounded-lg bg-[#F3F1FA] px-2.5 py-1.5 text-[10px] font-semibold text-[#514D82]">{tag}</span>):<span className="text-xs text-slate-400">Nenhuma etiqueta</span>}</div></div><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Consentimento</p><p className="mt-1 text-xs text-slate-700">{contact?.opt_in?'Opt-in registrado':'Não registrado'}</p></div><div className="rounded-xl bg-[#F7F8FC] p-3"><div className="flex items-center gap-2 text-[11px] font-semibold text-[#2F316B]"><Sparkles size={14} className="text-[#CB0A9F]"/> Inteligência Tendi</div><p className="mt-1.5 text-[10px] leading-5 text-slate-500">Resumo da conversa, tarefas e sugestões inteligentes serão disponibilizados nesta área.</p></div></div></aside>}
  </main>;
}
