'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Send, MessageCircle, Users, KanbanSquare, ChartNoAxesCombined, Settings, Inbox, Bot, Phone, Info, CheckCheck, Loader2, Building2, X, RefreshCw, ShieldCheck, LogOut, UserRound, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceSwitcher, type WorkspaceOption } from '@/components/workspace-switcher';
import { exitWorkspaceView, getWorkspaceContext, loadInbox, sendInboxMessage } from './actions';
import { sendInboxMessageSchema } from '@tendi/shared';

type Contact = { id: string; full_name: string; phone_e164: string | null; email: string | null; tags: string[]; opt_in: boolean };
type Team = { id: string; name: string; color: string };
type Conversation = { id: string; organization_id: string; contact_id: string; team_id: string | null; assigned_to: string | null; channel: string; status: string; unread_count: number; last_message_at: string | null; contacts: Contact | null; teams: Team | null };
type Message = { id: string; conversation_id: string; direction: 'inbound' | 'outbound' | 'internal'; message_type: string; body: string | null; created_at: string; delivery_status: string; sender_id: string | null };
type WorkspaceContext = { workspaces: WorkspaceOption[]; activeWorkspaceId: string; activeRole: WorkspaceOption['role']; isSuperAdmin: boolean; isViewingAsSuperAdmin: boolean; previousWorkspaceId: string; user: { id: string; name: string; email: string; avatarUrl: string | null } };
type InboxPayload = { organizationId: string; conversations: Conversation[]; messages: Message[]; whatsappConnected: boolean; canManageChannels: boolean };

const nav = [['Inbox', Inbox, '/inbox'], ['CRM', KanbanSquare, '/crm'], ['Contatos', Users, '/contatos'], ['Chatbots', Bot, '/chatbots'], ['Relatórios', ChartNoAxesCombined, '/relatorios'], ['Configurações', Settings, '/settings']] as const;
const time = (value?: string | null) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const initials = (value?: string | null) => (value || 'T').split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
const roleLabel = (role: WorkspaceOption['role']) => ({ owner: 'Owner', admin: 'Admin', manager: 'Supervisor', agent: 'Agente' }[role ?? 'agent']);

function RealtimeBridge({ organizationId, onChange }: { organizationId: string; onChange: () => void }) {
  const supabase = createClient();
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase.channel(`tendi-inbox-${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `organization_id=eq.${organizationId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `organization_id=eq.${organizationId}` }, onChange)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [organizationId, onChange, supabase]);
  return null;
}

export default function InboxPage() {
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [payload, setPayload] = useState<InboxPayload | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState('Todas');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(true);
  const supabase = createClient();

  const refreshInbox = useCallback(async () => {
    try {
      const result = await loadInbox();
      setPayload(result as unknown as InboxPayload);
      setSelectedId(current => current && result.conversations.some(item => item.id === current) ? current : (result.conversations[0]?.id ?? ''));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar os atendimentos.');
    }
  }, []);

  useEffect(() => {
    getWorkspaceContext().then(result => {
      setContext(result as WorkspaceContext);
      setLoading(false);
    }).catch(cause => {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seu workspace.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!context?.activeWorkspaceId) return;
    setSelectedId('');
    setPayload(null);
    void refreshInbox();
  }, [context?.activeWorkspaceId, refreshInbox]);

  async function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = sendInboxMessageSchema.safeParse({ conversationId: selectedId, body: draft });
    if (!parsed.success) {
      setError('Digite uma mensagem antes de enviar.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await sendInboxMessage(parsed.data);
      setDraft('');
      await refreshInbox();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  const conversations = payload?.conversations ?? [];
  const messages = payload?.messages ?? [];
  const selected = conversations.find(item => item.id === selectedId) ?? null;
  const contact = selected?.contacts ?? null;
  const thread = messages.filter(message => message.conversation_id === selectedId);
  const filtered = useMemo(() => conversations.filter(item => {
    const name = item.contacts?.full_name?.toLowerCase() ?? '';
    const matchesSearch = name.includes(search.toLowerCase());
    const matchesFilter = filter === 'Todas' || (filter === 'Não lidas' ? item.unread_count > 0 : item.status === filter);
    return matchesSearch && matchesFilter;
  }), [conversations, filter, search]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F7F8FC] text-[#2F316B]"><Loader2 className="animate-spin" /></main>;
  if (!context?.workspaces.length) return <main className="grid min-h-screen place-items-center bg-[#F7F8FC] p-6"><div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Building2 className="mx-auto text-[#CB0A9F]" size={34}/><h1 className="mt-4 text-xl font-bold text-[#2F316B]">Nenhum workspace disponível</h1><p className="mt-2 text-sm leading-6 text-slate-500">Sua conta ainda não está vinculada a uma empresa. Peça ao administrador para liberar seu acesso.</p><form action="/auth/signout" method="post"><button className="mt-5 rounded-xl bg-[#004751] px-4 py-2.5 text-sm font-semibold text-white">Sair</button></form></div></main>;

  return (
    <main className="flex min-h-screen bg-[#F7F8FC] text-slate-800">
      {context.isViewingAsSuperAdmin && <div className="fixed inset-x-0 top-0 z-[60] flex h-8 items-center justify-center gap-3 bg-amber-100 px-3 text-xs font-medium text-amber-900"><span>Visualizando {context.workspaces.find(item => item.id === context.activeWorkspaceId)?.name} como Super Admin</span><form action={exitWorkspaceView}><button className="underline underline-offset-2">Sair da visualização</button></form></div>}
      {context.isViewingAsSuperAdmin && <div className="h-8 shrink-0" />}
      <aside className="hidden w-[236px] shrink-0 flex-col border-r border-slate-200 bg-white p-3 lg:flex">
        <div className="mb-7 flex items-center px-2 pt-2"><img src="/brand/Logo%20Tendi.png" alt="Tendi" width="797" height="304" className="h-9 w-auto object-contain"/></div>
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p>
        <WorkspaceSwitcher workspaces={context.workspaces} activeWorkspaceId={context.activeWorkspaceId} isSuperAdmin={context.isSuperAdmin} />
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p>
        <nav className="space-y-1">{nav.map(([label, Icon, url]) => <a key={label} href={url} className={label === 'Inbox' ? 'flex items-center gap-3 rounded-xl bg-[#edf0fb] px-3 py-3 text-sm font-semibold text-[#2F316B]' : 'flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-600 hover:bg-slate-50'}><Icon size={18}/>{label}{label === 'Inbox' && conversations.length > 0 && <span className="ml-auto rounded-full bg-[#CB0A9F] px-2 py-0.5 text-xs text-white">{conversations.length > 99 ? '99+' : conversations.length}</span>}</a>)}</nav>
        <div className="mt-auto space-y-3">
          {context.isSuperAdmin && <a href="/admin" className="flex items-center gap-2 px-3 text-xs font-semibold text-[#2F316B]"><ShieldCheck size={15}/> Console Super Admin</a>}
          <details className="group relative border-t border-slate-100 pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl p-2 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#edf0fb] text-xs font-bold text-[#2F316B]">{initials(context.user.name)}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{context.user.name}</span><span className="block truncate text-[10px] text-slate-400">{context.user.email}</span></span>
              <ChevronDown size={14} className="text-slate-400"/>
            </summary>
            <div className="absolute bottom-full left-0 z-40 mb-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <p className="px-2 py-1 text-[10px] text-slate-400">{roleLabel(context.activeRole)}</p>
              <a href="/settings/account" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-600 hover:bg-slate-50"><UserRound size={14}/> Minha conta</a>
              <a href="/settings/appearance" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-600 hover:bg-slate-50">Tema</a>
              <form action="/auth/signout" method="post"><button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"><LogOut size={14}/> Sair</button></form>
            </div>
          </details>
        </div>
      </aside>

      <section className="flex w-[340px] min-w-[340px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <header className="flex h-[76px] items-center justify-between border-b border-slate-100 px-5"><div><p className="text-lg font-semibold text-[#2F316B]">Atendimento</p><p className="text-xs text-slate-400">{conversations.length} conversas · {conversations.filter(item => item.unread_count > 0).length} não lidas</p></div><button onClick={() => void refreshInbox()} className="rounded-lg border border-slate-200 p-2 text-slate-500" title="Atualizar"><RefreshCw size={17}/></button></header>
        <div className="p-4"><div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><Search size={16} className="text-slate-400"/><input placeholder="Buscar contato..." value={search} onChange={event => setSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none"/></div><div className="tendi-filter-wrap relative mt-4"><div className="tendi-filter-scroll flex gap-1 overflow-x-auto">{['Todas','Não lidas','open','pending','closed'].map(value => <button key={value} onClick={() => setFilter(value)} className={filter === value ? 'whitespace-nowrap rounded-full bg-[#edf0fb] px-3 py-1.5 text-xs font-semibold text-[#2F316B]' : 'whitespace-nowrap rounded-full bg-slate-50 px-3 py-1.5 text-xs text-slate-500'}>{value === 'open' ? 'Abertas' : value === 'pending' ? 'Pendentes' : value === 'closed' ? 'Encerradas' : value}</button>)}</div></div></div>
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">{filtered.map(item => <button key={item.id} onClick={() => setSelectedId(item.id)} className={selectedId === item.id ? 'flex w-full gap-3 border-l-[3px] border-[#CB0A9F] bg-[#f8f7fc] px-4 py-4 text-left' : 'flex w-full gap-3 px-4 py-4 text-left hover:bg-slate-50'}><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf0fb] text-sm font-semibold text-[#2F316B]">{initials(item.contacts?.full_name)}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><b className="truncate text-sm">{item.contacts?.full_name ?? 'Contato'}</b><span className="text-[10px] text-slate-400">{time(item.last_message_at)}</span></div><p className="mt-1 truncate text-xs text-slate-500">{item.channel}</p><div className="mt-2 flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{item.status}</span>{item.unread_count > 0 && <span className="ml-auto rounded-full bg-[#CB0A9F] px-1.5 py-0.5 text-[10px] text-white">{item.unread_count}</span>}</div></div></button>)}
          {!filtered.length && (conversations.length === 0 ? <div className="p-7 text-center"><MessageCircle className="mx-auto text-slate-300" size={28}/><p className="mt-3 text-sm font-semibold text-slate-700">Nenhuma conversa ainda</p>{payload?.canManageChannels ? <><p className="mt-1 text-xs leading-5 text-slate-400">Conecte seu número de WhatsApp para começar a receber atendimentos.</p><a href="/settings/channels" className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white">Conectar WhatsApp</a></> : <p className="mt-1 text-xs leading-5 text-slate-400">Peça a um administrador para conectar o WhatsApp.</p>}</div> : <div className="p-8 text-center"><MessageCircle className="mx-auto text-slate-300" size={28}/><p className="mt-3 text-sm font-semibold text-slate-600">Nenhuma conversa encontrada</p><p className="mt-1 text-xs text-slate-400">Tente ajustar a busca ou o filtro.</p></div>)}
        </div>
      </section>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-5">{selected ? <><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf0fb] text-sm font-semibold text-[#2F316B]">{initials(contact?.full_name)}</div><div className="min-w-0"><p className="truncate text-sm font-semibold">{contact?.full_name ?? 'Contato'}</p><p className="text-xs text-slate-400">{selected.channel} · {selected.teams?.name ?? 'Sem equipe'}</p></div></div><div className="flex items-center gap-3 text-slate-400"><button title="Ligar"><Phone size={18}/></button><button onClick={() => setShowDetails(!showDetails)} title="Detalhes"><Info size={18}/></button></div></> : <div><p className="text-sm font-semibold text-slate-700">Selecione uma conversa</p><p className="text-xs text-slate-400">Escolha uma conversa na lista para ver as mensagens.</p></div>}</header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5 md:p-8">{selected ? thread.map(message => <div key={message.id} className={message.direction === 'inbound' ? 'flex justify-start' : 'flex justify-end'}><div className={message.direction === 'inbound' ? 'max-w-[78%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm' : 'max-w-[78%] rounded-2xl rounded-tr-sm bg-[#edf0fb] px-4 py-3'}><p className="whitespace-pre-wrap text-sm leading-6">{message.body ?? `[${message.message_type}]`}</p><div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">{time(message.created_at)}{message.direction === 'outbound' && <CheckCheck size={13} className="text-[#004751]"/>}</div></div></div>) : <div className="grid h-full place-items-center text-center"><div><MessageCircle className="mx-auto text-slate-300" size={38}/><p className="mt-3 font-semibold text-slate-600">Selecione uma conversa</p><p className="mt-1 text-sm text-slate-400">Escolha uma conversa na lista para ver as mensagens.</p></div></div>}</div>
        {selected && <form onSubmit={submitMessage} className="border-t border-slate-200 bg-white p-4"><div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2"><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Digite uma mensagem..." className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"/><button disabled={sending || !draft.trim()} className="rounded-lg bg-[#004751] p-2.5 text-white disabled:opacity-50">{sending ? <Loader2 className="animate-spin" size={17}/> : <Send size={17}/>}</button></div></form>}
        {error && <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
      </section>

      {showDetails && selected && <aside className="hidden w-[270px] shrink-0 border-l border-slate-200 bg-white xl:block"><div className="border-b border-slate-100 p-5"><div className="flex items-center justify-between"><b className="text-sm">Detalhes do contato</b><button onClick={() => setShowDetails(false)}><X size={16}/></button></div><div className="mt-6 flex flex-col items-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#edf0fb] text-lg font-semibold text-[#2F316B]">{initials(contact?.full_name)}</div><p className="mt-3 font-semibold">{contact?.full_name}</p><p className="mt-1 text-xs text-slate-400">{contact?.phone_e164 ?? 'Sem telefone'}</p></div></div><div className="space-y-5 p-5"><div><p className="text-xs font-semibold text-slate-400">E-MAIL</p><p className="mt-1 break-all text-sm">{contact?.email ?? 'Não informado'}</p></div><div><p className="text-xs font-semibold text-slate-400">EQUIPE</p><p className="mt-1 text-sm">{selected.teams?.name ?? 'Não atribuída'}</p></div><div><p className="text-xs font-semibold text-slate-400">ETIQUETAS</p><div className="mt-2 flex flex-wrap gap-2">{(contact?.tags ?? []).map(tag => <span key={tag} className="rounded-full bg-[#edf0fb] px-2.5 py-1 text-xs text-[#2F316B]">{tag}</span>)}</div></div><div><p className="text-xs font-semibold text-slate-400">CONSENTIMENTO</p><p className="mt-1 text-sm">{contact?.opt_in ? 'Opt-in registrado' : 'Não registrado'}</p></div></div></aside>}
      {payload && <RealtimeBridge key={payload.organizationId} organizationId={payload.organizationId} onChange={() => void refreshInbox()}/>}
    </main>
  );
}
