'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, ArrowLeft, MessageCircle, Users, KanbanSquare, ChartNoAxesCombined,
  Settings, Inbox, Bot, ChevronDown, Phone, Info, Check, CheckCheck,
  Building2, X, RefreshCw, SlidersHorizontal, MoreHorizontal, Clock3, Menu,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MessageMedia } from '@/components/inbox/message-media';
import { ImageViewer, type ForwardTarget } from '@/components/inbox/image-viewer';
import { isViewableImage } from '@/lib/inbox-media';
import { Composer } from '@/components/inbox/composer';
import { ContactPanel } from '@/components/inbox/contact-panel';
import { ConversationList } from '@/components/inbox/conversation-list';
import { BrandLoader } from '@/components/brand-loader';
import { ContactAvatar } from '@/components/inbox/contact-avatar';
import { WorkspaceSidebar } from '@/components/workspace-sidebar';
import { EmptyState } from '@/components/ui';
import { OnboardingTour } from '@/components/onboarding-tour';
import { MobileTabBar } from '@/components/mobile-tab-bar';
import { WORKSPACE_NAV } from '@/components/workspace-shell';
import { useWorkspaceRole } from '@/lib/use-workspace-role';
import { clearWorkspace, isFresh, readWorkspace, writeWorkspace } from '@/lib/workspace-cache';
import { canAccess } from '@/lib/team';
import { provisionPendingWorkspace } from '@/lib/ensure-workspace';
import { requestedOrganizationId, resolveCurrentOrganization, withOrganization } from '@/lib/current-organization';
import { SupportBanner } from '@/components/support-banner';
import { channelSupportsAi } from '@/lib/ai-agent';
import { mergeMessages, previewText, statusLabel } from '@/lib/inbox-utils';
import { channelLabel } from '@/lib/channels';

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
  if (sender?.type === 'system') return { text: `${name ?? 'Mensagem automática'} · Automático`, ai: false };
  if (sender?.type === 'ai') return { text: `${name ?? 'Assistente'} · Agente de IA`, ai: true };
  if (sender?.type === 'phone' || (!sender && !message.sender_id)) return { text: 'Enviada pelo celular da empresa', ai: false };
  return { text: `${name ?? 'Atendente'} · Atendente`, ai: false };
}

function SenderTag({ message }: { message: Message }) {
  const label = senderLabel(message);
  if (!label) return null;
  return <p className={label.ai ? 'mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-[#F7B8E6]' : 'mb-1.5 text-[10.5px] font-semibold text-white/65'}>{label.ai && <Bot size={12} aria-hidden="true" />}{label.text}</p>;
}

// Liga/desliga a IA na conversa. 'handoff' = a IA pediu um atendente humano e parou de responder.
function AiControl({ mode, agentName, saving, onChange }: { mode: string; agentName: string; saving: boolean; onChange: (mode: 'on' | 'off') => void }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset transition disabled:opacity-50';
  if (mode === 'on') return <button disabled={saving} onClick={() => onChange('off')} title="A IA está respondendo esta conversa. Clique para assumir e desligar." className={`${base} bg-tendi-blush text-[#A8087F] ring-tendi-magenta/20 hover:bg-[#F8D9EF]`}><Bot size={12}/>{agentName} atendendo<span className="text-[#A8087F]/40">·</span>Desligar IA</button>;
  if (mode === 'handoff') return <button disabled={saving} onClick={() => onChange('on')} title="A IA pediu um atendente. Responda o cliente ou devolva a conversa para a IA." className={`${base} bg-amber-50 text-amber-700 ring-amber-600/20 hover:bg-amber-100`}><Bot size={12}/>IA pediu um atendente<span className="text-amber-700/40">·</span>Devolver para a IA</button>;
  return <button disabled={saving} onClick={() => onChange('on')} title="Deixar o agente de IA responder esta conversa." className={`${base} bg-white text-slate-500 ring-tendi-line hover:text-[#A8087F] hover:ring-tendi-magenta/30`}><Bot size={12}/>Ligar IA</button>;
}

export default function InboxPage() {
  const supabase = createClient() as any;
  const [userId, setUserId] = useState('');
  const [organizations, setOrganizations] = useState<Org[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState('');
  // Celular/tablet: o menu lateral abre como gaveta pelo botão da barra superior.
  const [menuOpen, setMenuOpen] = useState(false);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(true);
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [viewerImageId, setViewerImageId] = useState('');
  const { role, superAdmin, supportUntil } = useWorkspaceRole(organizationId);
  const nav = WORKSPACE_NAV.filter(item => role === undefined ? item.area === 'inbox' : canAccess(role, item.area)).map(item => [item.label, item.icon, withOrganization(item.href, organizationId), item.area] as const);
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
    // Sessão salva no navegador (sem ida à rede); o servidor valida o login a cada carregamento completo.
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData.session?.user;
    if (!sessionUser) { clearWorkspace(); window.location.assign('/login'); return; }
    setUserId(sessionUser.id);
    // Veio de outra tela do menu: as empresas já estão na memória da aba, sem consultar de novo.
    const cached = readWorkspace(requestedOrganizationId());
    if (cached && cached.userId === sessionUser.id && cached.organization && cached.organizations.length && isFresh(cached)) {
      setOrganizations(cached.organizations);
      setOrganizationId(current => current || cached.organization!.id);
      setLoading(false);
      return;
    }
    const auth = { user: sessionUser };
    // O Inbox só lista empresas em que a pessoa trabalha: vínculo ativo ou acesso de suporte liberado
    // pelo cliente. O Super Admin enxerga o cadastro de todas, mas não entra nos atendimentos delas.
    const requestedId = requestedOrganizationId();
    const workOrganizations = async (): Promise<Org[]> => (await resolveCurrentOrganization<Org>(supabase, auth.user.id, 'id,name', requestedId)).accessible;
    let list = await workOrganizations();
    const requestedWithoutAccess = Boolean(requestedId) && !list.some(org => org.id === requestedId);
    if (!list.length || requestedWithoutAccess) {
      const { data: platformAdmin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
      // Super Admin abrindo a empresa de um cliente sem acesso liberado: vai para a ficha dela no Console.
      if (platformAdmin && (requestedWithoutAccess || !list.length)) { window.location.replace(requestedWithoutAccess ? `/admin/organizations/${requestedId}` : '/admin'); return; }
      // Conta confirmada sem empresa: conclui a criação do workspace iniciada no cadastro.
      if (!list.length && await provisionPendingWorkspace(supabase, auth.user)) list = await workOrganizations();
    }
    setOrganizations(list);
    const requestedOrganization = requestedId && list.some(org => org.id === requestedId) ? requestedId : '';
    const chosen = requestedOrganization || list[0]?.id || '';
    setOrganizationId(current => current || chosen);
    setLoading(false);
    // Guarda para as próximas telas do menu (o papel entra pelo useWorkspaceRole).
    const chosenOrg = list.find(org => org.id === chosen);
    const previous = readWorkspace(chosen);
    if (chosenOrg) writeWorkspace({
      userId: auth.user.id, organization: chosenOrg, organizations: list,
      role: previous?.role ?? null, superAdmin: previous?.superAdmin ?? false, supportUntil: previous?.supportUntil ?? null,
      roleCheckedAt: previous?.userId === auth.user.id ? previous?.roleCheckedAt : undefined,
    });
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

  if (loading) return <main className="grid min-h-screen place-items-center bg-tendi-haze text-tendi-indigo"><BrandLoader size={56} /></main>;
  if (!organizations.length) return <main className="grid min-h-screen place-items-center bg-tendi-haze p-6"><div className="max-w-md rounded-3xl border border-tendi-line bg-white p-8 text-center shadow-card"><Building2 className="mx-auto text-tendi-magenta" size={34}/><h1 className="mt-4 text-xl font-semibold tracking-tight text-tendi-navy">Nenhuma empresa vinculada</h1><p className="mt-2 text-sm leading-6 text-slate-500">Sua conta ainda não pertence a uma organização. Peça ao Super Admin para criar uma empresa e associar seu usuário.</p>{error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Não foi possível criar seu workspace: {error}</p>}<form action="/auth/signout" method="post"><button className="mt-5 td-btn td-btn-teal">Sair</button></form></div></main>;

  const supportOrganization = organizations.find(org => org.id === organizationId);

  const unreadCount = conversations.filter(item => item.unread_count > 0).length;
  const sidebar = (mobile: boolean) => <WorkspaceSidebar
    homeHref={withOrganization('/inbox', organizationId)}
    organizationId={organizationId}
    organizationName={supportOrganization?.name}
    organizations={organizations}
    onSwitch={setOrganizationId}
    items={nav.map(([label, icon, href, area]) => ({ label, icon, href, area, active: area === 'inbox', badge: area === 'inbox' ? unreadCount : undefined }))}
    role={role}
    superAdmin={superAdmin}
    onNavigate={() => setMenuOpen(false)}
    onClose={mobile ? () => setMenuOpen(false) : undefined}
  />;

  return <div className="flex h-[100dvh] flex-col bg-white pt-[env(safe-area-inset-top)] lg:min-h-[620px]">
    {supportOrganization && <SupportBanner organizationId={supportOrganization.id} organizationName={supportOrganization.name} supportUntil={supportUntil}/>}
    {menuOpen && <div className="fixed inset-0 z-40 flex lg:hidden"><button aria-label="Fechar menu" className="absolute inset-0 bg-tendi-night/50 backdrop-blur-[2px]" onClick={()=>setMenuOpen(false)}/><div className="relative z-10 flex h-full animate-pop shadow-pop">{sidebar(true)}</div></div>}
    <main className="flex min-h-0 flex-1 overflow-hidden bg-tendi-haze text-slate-800">
    <div className="hidden lg:flex">{sidebar(false)}</div>
    <OnboardingTour organizationId={organizationId} role={role} superAdmin={superAdmin}/>

    <section className={selectedId ? "hidden w-full shrink-0 flex-col border-r border-tendi-line/80 bg-white md:flex md:w-[350px]" : "flex w-full shrink-0 flex-col border-r border-tendi-line/80 bg-white md:w-[350px]"}>
      <ConversationList conversations={conversations} userId={userId} selectedId={selectedId} onSelect={setSelectedId} onRefresh={()=>void loadInbox()} preview={id=>previewText(latestMessage(id),'Nova conversa')} memberNames={memberNames}/>
    </section>

    <section className={selectedId ? "flex min-w-0 flex-1 flex-col bg-tendi-haze" : "hidden min-w-0 flex-1 flex-col bg-tendi-haze md:flex"}>
      <header className="flex min-h-[60px] items-center justify-between gap-2 border-b border-tendi-line/80 bg-white px-2 md:min-h-[72px] md:px-5"><div className="flex min-w-0 items-center gap-2 md:gap-3">{selected&&<button onClick={()=>setSelectedId("")} className="td-icon-btn size-10 text-tendi-indigo md:hidden" aria-label="Voltar para conversas" title="Voltar para conversas"><ArrowLeft size={20}/></button>}<ContactAvatar contactId={selected?.contact_id} name={contact?.full_name} channel={selected?.channel} className="size-10 rounded-full text-xs ring-2 ring-white shadow-card"/><div className="min-w-0"><p className="truncate text-[14.5px] font-semibold tracking-tight text-tendi-navy">{contact?.full_name??'Selecione uma conversa'}</p><p className="mt-0.5 truncate text-[11.5px] text-slate-400">{selected?(<>{channelLabel(selected.channel)} · {selected.teams?.name??'Sem setor'}</>):'Sua central de relacionamento'}</p></div></div>
        <div className="flex items-center gap-0.5">{selected?.contacts?.phone_e164?<a href={`tel:${selected.contacts.phone_e164}`} className="td-icon-btn" title="Ligar" aria-label="Ligar para o contato"><Phone size={17}/></a>:<span className="td-icon-btn cursor-not-allowed opacity-40 hover:bg-transparent hover:text-slate-400" title="Contato sem telefone"><Phone size={17}/></span>}<button onClick={()=>setShowDetails(!showDetails)} className={`td-icon-btn ${showDetails&&selected?'xl:bg-tendi-mist xl:text-tendi-indigo':''}`} title="Detalhes do contato" aria-label="Detalhes do contato"><Info size={17}/></button><div className="relative"><button onClick={()=>setConversationMenuOpen(v=>!v)} aria-label="Mais opções da conversa" aria-expanded={conversationMenuOpen} className={`td-icon-btn ${conversationMenuOpen?'bg-tendi-mist text-tendi-indigo':''}`} title="Mais opções"><MoreHorizontal size={18}/></button>{conversationMenuOpen&&<><button aria-label="Fechar opções" className="fixed inset-0 z-20 cursor-default" onClick={()=>setConversationMenuOpen(false)}/><div className="absolute right-0 top-11 z-30 w-56 animate-pop rounded-2xl border border-tendi-line bg-white p-1.5 shadow-pop">{[['Abrir contatos','/contatos'],['Abrir CRM','/crm'],['Configurações','/configuracoes']].map(([label,href])=><Link key={href} href={withOrganization(href!,organizationId)} className="block rounded-lg px-3 py-2 text-[13px] text-slate-600 transition hover:bg-tendi-haze hover:text-tendi-navy">{label}</Link>)}<button onClick={()=>window.location.reload()} className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-600 transition hover:bg-tendi-haze hover:text-tendi-navy">Atualizar Inbox</button><a href="mailto:suporte@tendidesk.com.br" className="block rounded-lg px-3 py-2 text-[13px] text-slate-600 transition hover:bg-tendi-haze hover:text-tendi-navy">Ajuda e suporte</a></div></>}</div></div>
      </header>
      {selected?<><div className="flex items-center justify-between gap-2 border-b border-tendi-line/70 bg-white/80 px-3 py-2 backdrop-blur md:px-5"><div className="flex min-w-0 flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15"><span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60"/><span className="relative inline-flex size-1.5 rounded-full bg-emerald-500"/></span>{statusLabel(selected.status)}</span>{agent?.is_enabled&&channelSupportsAi(selected.channel)&&<AiControl mode={selected.ai_mode??'off'} agentName={agent.name} saving={aiSaving} onChange={mode=>void setAiMode(selected,mode)}/>}</div><div className="hidden items-center gap-1.5 text-[10.5px] text-slate-400 sm:flex"><Clock3 size={13}/> Última atividade {time(selected.last_message_at)||'—'}</div></div>
        <div className="relative min-h-0 flex-1"><div ref={threadRef} onScroll={onThreadScroll} className="h-full space-y-3 overflow-y-auto overscroll-contain bg-[radial-gradient(#E4E6F1_1px,transparent_1px)] [background-size:20px_20px] px-3 py-5 md:space-y-4 md:px-8 md:py-7">{thread.length?thread.map(message=>{const ai=senderLabel(message)?.ai;return <div key={message.id} className={message.direction==='inbound'?'flex justify-start':'flex justify-end'}><div className={message.direction==='internal'?'max-w-[86%] md:max-w-[72%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-card':message.direction==='inbound'?'max-w-[86%] md:max-w-[72%] rounded-[18px] rounded-tl-md border border-tendi-line/70 bg-white px-4 py-2.5 text-[14px] leading-6 text-slate-700 shadow-card':ai?'max-w-[86%] md:max-w-[72%] rounded-[18px] rounded-tr-md bg-gradient-to-br from-[#2F316B] via-[#2C2D66] to-[#4A2470] px-4 py-2.5 text-[14px] leading-6 text-white shadow-[0_10px_24px_-12px_rgba(74,36,112,.55)]':'max-w-[86%] md:max-w-[72%] rounded-[18px] rounded-tr-md bg-tendi-indigo px-4 py-2.5 text-[14px] leading-6 text-white shadow-[0_10px_24px_-12px_rgba(47,49,107,.55)]'}>{message.direction==='internal'&&<p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Nota interna</p>}<SenderTag message={message}/><MessageMedia message={message} onOpenImage={()=>setViewerImageId(message.id)}/><div className={message.direction==='outbound'?'mt-1 flex items-center justify-end gap-1 text-[10px] text-white/60':'mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400'}>{time(message.created_at)}{message.direction==='outbound'&&(message.delivery_status==='failed'?<span className="font-semibold text-rose-200">Falha ao enviar</span>:message.delivery_status==='queued'?<Clock3 size={13} aria-label="Na fila"/>:message.delivery_status==='read'?<CheckCheck size={13} className="text-sky-300" aria-label="Lida"/>:message.delivery_status==='delivered'?<CheckCheck size={13} aria-label="Entregue"/>:<Check size={13} aria-label="Enviada"/>)}</div></div></div>;}):<div className="grid h-full place-items-center"><EmptyState icon={MessageCircle} title="Conversa sem mensagens" description="As mensagens recebidas aparecerão neste espaço."/></div>}</div>
        {!atBottom&&<button type="button" onClick={()=>{scrollToBottom();setNewSince(0);}} aria-label="Ir para a última mensagem" title="Ir para a última mensagem" className="absolute bottom-4 right-5 flex size-11 items-center justify-center rounded-full border border-tendi-line bg-white text-tendi-navy shadow-pop transition hover:-translate-y-0.5 hover:bg-tendi-haze md:right-8"><ChevronDown size={20}/>{newSince>0&&<span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-tendi-magenta px-1.5 text-[11px] font-bold leading-5 text-white ring-2 ring-white">{newSince}</span>}</button>}</div>
        <Composer conversation={selected} onSent={()=>loadInbox()} onError={setError}/>
      </>:<div className="grid flex-1 place-items-center bg-[radial-gradient(#E4E6F1_1px,transparent_1px)] p-8 [background-size:20px_20px]"><EmptyState icon={MessageCircle} title="Seu atendimento começa aqui" description="Selecione uma conversa na lista para ver o histórico e continuar o relacionamento."/></div>}
      {error&&<div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
    </section>

    {viewerImageId&&viewerImages.some(image=>image.id===viewerImageId)&&<ImageViewer images={viewerImages} startId={viewerImageId} senderName={viewerSenderName} targets={forwardTargets} onClose={()=>setViewerImageId('')} onForwarded={()=>{void loadInbox().catch(err=>setError(err.message));}}/>}

    {showDetails&&selected&&<aside className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-tendi-line/80 bg-white xl:block"><ContactPanel conversation={selected} userId={userId} onChanged={()=>{void loadInbox().catch(err=>setError(err.message));}} onClose={()=>setShowDetails(false)}/></aside>}
    {/* Celular e tablet: os detalhes do contato abrem por cima da conversa. */}
    {showDetails&&selected&&<div className="fixed inset-0 z-40 flex justify-end xl:hidden"><button aria-label="Fechar detalhes" className="absolute inset-0 bg-tendi-night/50 backdrop-blur-[2px]" onClick={()=>setShowDetails(false)}/><aside className="relative z-10 h-full w-full max-w-[380px] overflow-y-auto overscroll-contain bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-pop"><ContactPanel conversation={selected} userId={userId} onChanged={()=>{void loadInbox().catch(err=>setError(err.message));}} onClose={()=>setShowDetails(false)}/></aside></div>}
    </main>
    {/* Celular/tablet: navegação inferior; some com uma conversa aberta no celular (a conversa usa a tela toda). */}
    <MobileTabBar pathname="/inbox" organizationId={organizationId} role={role} superAdmin={superAdmin} onMenu={()=>setMenuOpen(true)} badge={conversations.filter(item=>item.unread_count>0).length} className={selectedId ? 'hidden md:block' : ''}/>
  </div>;
}
