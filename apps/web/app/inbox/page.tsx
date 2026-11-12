'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, ArrowLeft, MessageCircle, Users, KanbanSquare, ChartNoAxesCombined,
  Settings, Inbox, Bot, ChevronDown, Phone, Info, Check, CheckCheck, Loader2,
  Building2, X, RefreshCw, SlidersHorizontal, Sparkles, MoreHorizontal, Clock3,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MessageMedia } from '@/components/inbox/message-media';
import { ImageViewer, type ForwardTarget } from '@/components/inbox/image-viewer';
import { isViewableImage } from '@/lib/inbox-media';
import { Composer } from '@/components/inbox/composer';
import { ContactPanel } from '@/components/inbox/contact-panel';
import { ConversationList } from '@/components/inbox/conversation-list';
import { ContactAvatar } from '@/components/inbox/contact-avatar';
import { SidebarFooter } from '@/components/sidebar-footer';
import { WORKSPACE_NAV } from '@/components/workspace-shell';
import { useWorkspaceRole } from '@/lib/use-workspace-role';
import { canAccess } from '@/lib/team';
import { provisionPendingWorkspace } from '@/lib/ensure-workspace';
import { mergeMessages, previewText, statusLabel } from '@/lib/inbox-utils';

type Org = { id: string; name: string };
type Contact = { id: string; full_name: string; phone_e164: string | null; email: string | null; tags: string[]; opt_in: boolean };
type Team = { id: string; name: string; color: string };
type Conversation = { id: string; organization_id: string; contact_id: string; team_id: string | null; assigned_to: string | null; channel: string; status: string; unread_count: number; last_message_at: string | null; ai_mode?: 'off' | 'on' | 'handoff' | null; contacts: Contact | null; teams: Team | null };
type Message = { id: string; conversation_id: string; direction: 'inbound' | 'outbound' | 'internal'; message_type: string; body: string | null; created_at: string; delivery_status: string; sender_id: string | null; payload: Record<string, unknown> | null };

const time = (value?: string | null) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const initials = (value?: string | null) => (value || 'C').split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';

// Quem enviou a mensagem (aparece em cima do balão): atendente, agente de IA ou celular da empresa.
function senderLabel(message: Message): { text: string; ai: boolean } | null {
  if (message.direction !== 'outbound') return null;
  const raw = message.payload && typeof message.payload === 'object' ? (message.payload as Record<string, unknown>).sender : null;
  const sender = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const name = typeof sender?.name === 'string' && sender.name.trim() ? sender.name.trim() : null;
  if (sender?.type === 'ai') return { text: `${name ?? 'Assistente'} · Agente de IA`, ai: true };
  if (sender?.type === 'phone' || (!sender && !message.sender_id)) return { text: 'Enviada pelo celular da empresa', ai: false };
  return { text: `${name ?? 'Atendente'} · Atendente`, ai: false };
}

function SenderTag({ message }: { message: Message }) {
  const label = senderLabel(message);
  if (!label) return null;
  return <p className={label.ai ? 'mb-1 text-[10px] font-semibold text-fuchsia-200' : 'mb-1 text-[10px] font-semibold text-white/70'}>{label.ai ? '✦ ' : ''}{label.text}</p>;
}

// Liga/desliga a IA na conversa. 'handoff' = a IA pediu um atendente humano e parou de responder.
function AiControl({ mode, agentName, saving, onChange }: { mode: string; agentName: string; saving: boolean; onChange: (mode: 'on' | 'off') => void }) {
  const base = 'ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold transition disabled:opacity-50';
  if (mode === 'on') return <button disabled={saving} onClick={() => onChange('off')} title="A IA está respondendo esta conversa. Clique para assumir e desligar." className={`${base} bg-[#FCEAF7] text-[#B70A90] hover:bg-[#F8D9EF]`}><Sparkles size={12}/>{agentName} atendendo · Desligar IA</button>;
  if (mode === 'handoff') return <button disabled={saving} onClick={() => onChange('on')} title="A IA pediu um atendente. Responda o cliente ou devolva a conversa para a IA." className={`${base} bg-amber-50 text-amber-700 hover:bg-amber-100`}><Sparkles size={12}/>IA pediu um atendente · Devolver para a IA</button>;
  return <button disabled={saving} onClick={() => onChange('on')} title="Deixar o agente de IA responder esta conversa." className={`${base} border border-slate-200 bg-white text-slate-500 hover:border-[#CB0A9F]/30 hover:text-[#B70A90]`}><Sparkles size={12}/>Ligar IA</button>;
}

export default function InboxPage() {
  const supabase = createClient() as any;
  const [userId, setUserId] = useState('');
  const [organizations, setOrganizations] = useState<Org[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(true);
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [viewerImageId, setViewerImageId] = useState('');
  const { role, superAdmin } = useWorkspaceRole(organizationId);
  const nav = WORKSPACE_NAV.filter(item => role === undefined ? item.area === 'inbox' : canAccess(role, item.area)).map(item => [item.label, item.icon, item.href] as const);
  const [agent, setAgent] = useState<{ name: string; is_enabled: boolean } | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const selectedRef = useRef('');
  // Rolagem da conversa: começa no fim e mostra a seta para descer quando a pessoa sobe.
  const threadRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const lastCountRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [newSince, setNewSince] = useState(0);
  const scrollToBottom = useCallback((smooth = true) => {
    const element = threadRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  const onThreadScroll = () => {
    const element = threadRef.current;
    if (!element) return;
    const near = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setNewSince(0);
  };

  const loadOrganizations = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { window.location.assign('/login'); return; }
    setUserId(auth.user.id);
    const { data, error: orgError } = await supabase.from('organizations').select('id,name').order('name');
    if (orgError) throw orgError;
    let list = (data ?? []) as Org[];
    // Conta confirmada sem empresa: conclui a criação do workspace iniciada no cadastro.
    if (!list.length && await provisionPendingWorkspace(supabase, auth.user)) {
      const retry = await supabase.from('organizations').select('id,name').order('name');
      if (retry.error) throw retry.error;
      list = (retry.data ?? []) as Org[];
    }
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
      .select('id,organization_id,contact_id,team_id,assigned_to,channel,status,unread_count,last_message_at,ai_mode,contacts(id,full_name,phone_e164,email,tags,opt_in),teams(id,name,color)')
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (conversationError) throw conversationError;
    const rows = (data ?? []) as unknown as Conversation[];
    setConversations(rows);
    // Link vindo do CRM/Contatos: /inbox?conversation=<id> ou /inbox?contact=<id> (só na primeira abertura).
    const params = new URLSearchParams(window.location.search);
    const wantedConversation = params.get('conversation');
    const wantedContact = params.get('contact');
    const fromLink = !selectedRef.current ? (rows.find(row => row.id === wantedConversation) ?? rows.find(row => row.contact_id === wantedContact)) : undefined;
    const nextSelected = selectedRef.current && rows.some(row => row.id === selectedRef.current) ? selectedRef.current : (fromLink?.id ?? rows[0]?.id ?? '');
    selectedRef.current = nextSelected;
    setSelectedId(nextSelected);
    const ids = rows.map(row => row.id);
    if (!ids.length) { setMessages([]); return; }
    // Prévias da lista: últimas 300 mensagens do workspace. Conversa aberta: até 500 mensagens dela.
    const columns = 'id,conversation_id,direction,message_type,body,created_at,delivery_status,sender_id,payload';
    const [recent, thread] = await Promise.all([
      supabase.from('messages').select(columns).in('conversation_id', ids).order('created_at', { ascending: false }).limit(300),
      nextSelected ? supabase.from('messages').select(columns).eq('conversation_id', nextSelected).order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
    ]);
    if (recent.error) throw recent.error;
    if (thread.error) throw thread.error;
    setMessages(mergeMessages((recent.data ?? []) as Message[], (thread.data ?? []) as Message[]));
  }, [organizationId, supabase]);

  useEffect(() => { void loadOrganizations().catch(err => { setError(err.message); setLoading(false); }); }, [loadOrganizations]);
  useEffect(() => { if (organizationId) void loadInbox().catch(err => setError(err.message)); }, [organizationId, loadInbox]);
  // Agente de IA da empresa (liberado pelo Super Admin). Sem agente liberado, o controle de IA não aparece.
  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    void supabase.from('ai_agents').select('name,is_enabled').eq('organization_id', organizationId).maybeSingle()
      .then(({ data }: any) => { if (active) setAgent(data ? { name: data.name, is_enabled: Boolean(data.is_enabled) } : null); });
    return () => { active = false; };
  }, [organizationId, supabase]);

  async function setAiMode(conversation: Conversation, mode: 'on' | 'off') {
    setAiSaving(true);
    const { error: updateError } = await supabase.from('conversations').update({ ai_mode: mode }).eq('id', conversation.id).eq('organization_id', conversation.organization_id);
    setAiSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setConversations(current => current.map(item => item.id === conversation.id ? { ...item, ai_mode: mode } : item));
  }
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase.channel(`tendi-inbox-${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `organization_id=eq.${organizationId}` }, () => { void loadInbox(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `organization_id=eq.${organizationId}` }, () => { void loadInbox(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [organizationId, loadInbox, supabase]);

  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  // Ao abrir uma conversa, carrega o histórico dela.
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void supabase.from('messages').select('id,conversation_id,direction,message_type,body,created_at,delivery_status,sender_id,payload')
      .eq('conversation_id', selectedId).order('created_at', { ascending: false }).limit(500)
      .then(({ data, error: threadError }: any) => {
        if (!active) return;
        if (threadError) { setError(threadError.message); return; }
        setMessages(current => mergeMessages(current, (data ?? []) as Message[]));
      });
    return () => { active = false; };
  }, [selectedId, supabase]);
  useEffect(() => {
    const update = () => setTabVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  // Conversa aberta com a aba visível = lida.
  useEffect(() => {
    const target = conversations.find(item => item.id === selectedId);
    if (!target || target.unread_count === 0 || !tabVisible) return;
    setConversations(current => current.map(item => item.id === target.id ? { ...item, unread_count: 0 } : item));
    // O Supabase só envia a consulta quando há um .then()/await: um "void" sozinho não grava nada.
    void supabase.from('conversations').update({ unread_count: 0 }).eq('id', target.id).eq('organization_id', target.organization_id).then(() => undefined);
  }, [conversations, selectedId, tabVisible, supabase]);

  useEffect(() => { lastCountRef.current = 0; atBottomRef.current = true; setAtBottom(true); setNewSince(0); setViewerImageId(''); }, [selectedId]);
  const threadLength = messages.filter(message => message.conversation_id === selectedId).length;
  useEffect(() => {
    const previous = lastCountRef.current;
    lastCountRef.current = threadLength;
    if (!threadLength) return;
    if (previous === 0 || atBottomRef.current) requestAnimationFrame(() => scrollToBottom(previous !== 0));
    else if (threadLength > previous) setNewSince(count => count + (threadLength - previous));
  }, [threadLength, selectedId, scrollToBottom]);
  // Nomes de quem está com cada conversa (aba "Outros").
  useEffect(() => {
    const ids = [...new Set(conversations.map(item => item.assigned_to).filter((id): id is string => Boolean(id)))].filter(id => !memberNames[id]);
    if (!ids.length) return;
    void supabase.from('profiles').select('id,full_name,email').in('id', ids).then(({ data }: any) => {
      const next: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) next[row.id] = (row.full_name || row.email?.split('@')[0] || 'Atendente').split(' ')[0]!;
      setMemberNames(current => ({ ...current, ...next }));
    });
  }, [conversations, memberNames, supabase]);

  const selected = conversations.find(item => item.id === selectedId) ?? null;
  const contact = selected?.contacts ?? null;
  const thread = messages.filter(message => message.conversation_id === selectedId);
  // Visualizador de imagens: fotos e figurinhas da conversa aberta e conversas para encaminhar.
  const viewerImages = thread.filter(isViewableImage);
  const viewerSenderName = (image: { id: string }) => {
    const message = thread.find(item => item.id === image.id);
    if (!message || message.direction === 'inbound') return contact?.full_name ?? 'Contato';
    return senderLabel(message)?.text ?? 'Equipe';
  };
  const forwardTargets: ForwardTarget[] = conversations
    .filter(item => item.channel === 'whatsapp' && item.contacts?.phone_e164)
    .map(item => ({ id: item.id, name: item.contacts?.full_name || item.contacts?.phone_e164 || 'Contato', phone: item.contacts?.phone_e164 ?? null }));
  const latestMessage = (conversationId: string) => { const rows = messages.filter(message => message.conversation_id === conversationId); return rows[rows.length - 1]; };

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] text-[#2F316B]"><Loader2 className="animate-spin" /></main>;
  if (!organizations.length) return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] p-6"><div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Building2 className="mx-auto text-[#CB0A9F]" size={34}/><h1 className="mt-4 text-xl font-bold text-[#2F316B]">Nenhuma empresa vinculada</h1><p className="mt-2 text-sm leading-6 text-slate-500">Sua conta ainda não pertence a uma organização. Peça ao Super Admin para criar uma empresa e associar seu usuário.</p>{error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Não foi possível criar seu workspace: {error}</p>}<form action="/auth/signout" method="post"><button className="mt-5 rounded-xl bg-[#004751] px-4 py-2.5 text-sm font-semibold text-white">Sair</button></form></div></main>;

  return <main className="flex h-screen min-h-[620px] overflow-hidden bg-[#F4F6FB] text-slate-800">
    <aside className="hidden w-[218px] shrink-0 flex-col border-r border-slate-200/80 bg-white px-3 py-5 lg:flex">
      <div className="mb-8 flex items-center px-3"><img src="/brand/Logo%20Tendi.png" alt="Tendi" width="797" height="304" className="h-9 w-auto object-contain"/></div>
      <label className="mb-7 block px-2"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</span><div className="relative"><select value={organizationId} onChange={e=>setOrganizationId(e.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-[#FAFBFD] p-3 pr-8 text-sm font-semibold text-[#2F316B] outline-none focus:border-[#004751]">{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={16}/></div></label>
      <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</p>
      <nav className="space-y-1">{nav.map(([label,Icon,url])=><a key={label} href={url} className={label==='Inbox'?'group flex items-center gap-3 rounded-xl bg-[#F0F0FA] px-3 py-3 text-sm font-semibold text-[#2F316B] shadow-sm shadow-indigo-950/[.03]':'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500 transition hover:bg-slate-50 hover:text-[#2F316B]'}><Icon size={18}/>{label}{label==='Inbox'&&<span className="ml-auto rounded-full bg-[#CB0A9F] px-2 py-0.5 text-[10px] font-bold text-white">{conversations.length}</span>}</a>)}</nav>
      <SidebarFooter organizationId={organizationId} role={role} superAdmin={superAdmin}/>
    </aside>

    <section className={selectedId ? "hidden w-full shrink-0 flex-col border-r border-slate-200/80 bg-white md:flex md:w-[350px]" : "flex w-full shrink-0 flex-col border-r border-slate-200/80 bg-white md:w-[350px]"}>
      <ConversationList conversations={conversations} userId={userId} selectedId={selectedId} onSelect={setSelectedId} onRefresh={()=>void loadInbox()} preview={id=>previewText(latestMessage(id),'Nova conversa')} memberNames={memberNames}/>
    </section>

    <section className={selectedId ? "flex min-w-0 flex-1 flex-col bg-[#F7F8FC]" : "hidden min-w-0 flex-1 flex-col bg-[#F7F8FC] md:flex"}>
      <header className="flex min-h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-5"><div className="flex min-w-0 items-center gap-3">{selected&&<button onClick={()=>setSelectedId("")} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 md:hidden" title="Voltar para conversas"><ArrowLeft size={18}/></button>}<ContactAvatar contactId={selected?.contact_id} name={contact?.full_name} className="size-10 rounded-full text-xs"/><div className="min-w-0"><p className="truncate text-sm font-bold text-[#25275B]">{contact?.full_name??'Selecione uma conversa'}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{selected?(`${selected.channel} · ${selected.teams?.name??'Sem equipe'}`):'Sua central de relacionamento'}</p></div></div>
        <div className="flex items-center gap-1 text-slate-400">{selected?.contacts?.phone_e164?<a href={`tel:${selected.contacts.phone_e164}`} className="rounded-lg p-2.5 transition hover:bg-slate-50 hover:text-[#004751]" title="Ligar" aria-label="Ligar para o contato"><Phone size={17}/></a>:<span className="cursor-not-allowed rounded-lg p-2.5 opacity-40" title="Contato sem telefone"><Phone size={17}/></span>}<button onClick={()=>setShowDetails(!showDetails)} className="rounded-lg p-2.5 transition hover:bg-slate-50 hover:text-[#004751]" title="Detalhes"><Info size={17}/></button><div className="relative"><button onClick={()=>setConversationMenuOpen(v=>!v)} aria-label="Mais opções da conversa" aria-expanded={conversationMenuOpen} className="rounded-lg p-2.5 transition hover:bg-slate-50 hover:text-[#004751]" title="Mais opções"><MoreHorizontal size={18}/></button>{conversationMenuOpen&&<><button aria-label="Fechar opções" className="fixed inset-0 z-20 cursor-default" onClick={()=>setConversationMenuOpen(false)}/><div className="absolute right-0 top-11 z-30 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><a href="/contatos" className="block rounded-lg px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50">Abrir contatos</a><a href="/crm" className="block rounded-lg px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50">Abrir CRM</a><a href="/configuracoes" className="block rounded-lg px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50">Configurações</a><button onClick={()=>window.location.reload()} className="w-full rounded-lg px-3 py-2.5 text-left text-xs text-slate-600 hover:bg-slate-50">Atualizar Inbox</button><a href="mailto:suporte@tendi.app" className="block rounded-lg px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50">Ajuda e suporte</a></div></>}</div></div>
      </header>
      {selected?<><div className="flex items-center justify-between border-b border-slate-200/70 bg-white/70 px-5 py-2.5"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500"/><span className="text-[11px] font-medium text-slate-500">{statusLabel(selected.status)}</span>{agent?.is_enabled&&<AiControl mode={selected.ai_mode??'off'} agentName={agent.name} saving={aiSaving} onChange={mode=>void setAiMode(selected,mode)}/>}</div><div className="flex items-center gap-2 text-[10px] text-slate-400"><Clock3 size={13}/> Última atividade {time(selected.last_message_at)||'—'}</div></div>
        <div className="relative min-h-0 flex-1"><div ref={threadRef} onScroll={onThreadScroll} className="h-full space-y-5 overflow-y-auto px-5 py-7 md:px-8">{thread.length?thread.map(message=><div key={message.id} className={message.direction==='inbound'?'flex justify-start':'flex justify-end'}><div className={message.direction==='internal'?'max-w-[78%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm':message.direction==='inbound'?'max-w-[78%] rounded-2xl rounded-tl-md border border-slate-100 bg-white px-4 py-3 shadow-[0_3px_12px_rgba(30,40,80,.04)]':'max-w-[78%] rounded-2xl rounded-tr-md bg-[#2F316B] px-4 py-3 text-white shadow-[0_5px_16px_rgba(47,49,107,.12)]'}>{message.direction==='internal'&&<p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Nota interna</p>}<SenderTag message={message}/><MessageMedia message={message} onOpenImage={()=>setViewerImageId(message.id)}/><div className={message.direction==='outbound'?'mt-1 flex items-center justify-end gap-1 text-[10px] text-white/60':'mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400'}>{time(message.created_at)}{message.direction==='outbound'&&(message.delivery_status==='failed'?<span className="font-semibold text-rose-200">Falha ao enviar</span>:message.delivery_status==='queued'?<Clock3 size={13} aria-label="Na fila"/>:message.delivery_status==='read'?<CheckCheck size={13} className="text-sky-300" aria-label="Lida"/>:message.delivery_status==='delivered'?<CheckCheck size={13} aria-label="Entregue"/>:<Check size={13} aria-label="Enviada"/>)}</div></div></div>):<div className="grid h-full place-items-center text-center"><div><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-[#A6AAC5] shadow-sm"><MessageCircle size={26}/></div><p className="mt-4 text-sm font-semibold text-slate-600">Conversa sem mensagens</p><p className="mt-1 text-xs text-slate-400">As mensagens recebidas aparecerão neste espaço.</p></div></div>}</div>
        {!atBottom&&<button type="button" onClick={()=>{scrollToBottom();setNewSince(0);}} aria-label="Ir para a última mensagem" title="Ir para a última mensagem" className="absolute bottom-4 right-5 flex size-11 items-center justify-center rounded-full border border-slate-200 bg-white text-[#1D1F4E] shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-50 md:right-8"><ChevronDown size={20}/>{newSince>0&&<span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-rose-600 px-1.5 text-[11px] font-bold leading-5 text-white">{newSince}</span>}</button>}</div>
        <Composer conversation={selected} onSent={()=>loadInbox()} onError={setError}/>
      </>:<div className="grid flex-1 place-items-center p-8 text-center"><div className="max-w-sm"><div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-white text-[#B0B5CF] shadow-sm"><MessageCircle size={30}/></div><p className="mt-5 text-base font-bold text-[#2F316B]">Seu atendimento começa aqui</p><p className="mt-2 text-sm leading-6 text-slate-400">Selecione uma conversa na lista para visualizar o histórico e continuar o relacionamento.</p><div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[10px] font-medium text-slate-500 shadow-sm"><Sparkles size={13} className="text-[#CB0A9F]"/> Central de atendimento Tendi</div></div></div>}
      {error&&<div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
    </section>

    {viewerImageId&&viewerImages.some(image=>image.id===viewerImageId)&&<ImageViewer images={viewerImages} startId={viewerImageId} senderName={viewerSenderName} targets={forwardTargets} onClose={()=>setViewerImageId('')} onForwarded={()=>{void loadInbox().catch(err=>setError(err.message));}}/>}

    {showDetails&&selected&&<aside className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-slate-200/80 bg-white xl:block"><ContactPanel conversation={selected} userId={userId} onChanged={()=>{void loadInbox().catch(err=>setError(err.message));}} onClose={()=>setShowDetails(false)}/></aside>}
  </main>;
}
