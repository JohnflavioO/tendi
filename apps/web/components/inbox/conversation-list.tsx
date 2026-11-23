'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { ContactAvatar } from '@/components/inbox/contact-avatar';
import { conversationTags, inboxTabOf, relativeTime, type InboxTab } from '@/lib/inbox-utils';
import { CHANNEL_INFO, CHANNEL_ORDER, type ChannelKey } from '@/lib/channels';
import { ChannelBadge } from '@/components/inbox/channel-badge';

export type ListConversation = {
  id: string;
  contact_id: string;
  assigned_to: string | null;
  channel: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  ai_mode?: string | null;
  contacts: { full_name: string; phone_e164: string | null; tags: string[] } | null;
  teams: { name: string; color: string } | null;
};

const TABS: Array<{ key: InboxTab; label: string; hint: string }> = [
  { key: 'novos', label: 'Novos', hint: 'Sem responsável' },
  { key: 'meus', label: 'Meus', hint: 'Atribuídos a você' },
  { key: 'outros', label: 'Outros', hint: 'Com outros atendentes' },
  { key: 'todas', label: 'Todas', hint: 'Inclui encerradas' },
];
const STATUS = [
  { value: '', label: 'Qualquer status' },
  { value: 'open', label: 'Abertas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'closed', label: 'Encerradas' },
];

/** Lista de conversas do Inbox (coluna do meio). */
export function ConversationList({ conversations, userId, selectedId, onSelect, onRefresh, preview, memberNames, connectedChannels = [] }: {
  conversations: ListConversation[];
  /** Canais conectados na empresa: aparecem no filtro mesmo antes da primeira conversa. */
  connectedChannels?: string[];
  userId: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  preview: (conversationId: string) => string;
  memberNames: Record<string, string>;
}) {
  const [tab, setTab] = useState<InboxTab | null>(null);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState<ChannelKey | ''>('');
  const [, setTick] = useState(0);

  // Atualiza o "há X min" sem depender de nova mensagem.
  useEffect(() => { const timer = setInterval(() => setTick(t => t + 1), 60_000); return () => clearInterval(timer); }, []);

  const counts = useMemo(() => {
    const result: Record<InboxTab, number> = { novos: 0, meus: 0, outros: 0, todas: conversations.length };
    for (const item of conversations) { const key = inboxTabOf(item, userId); if (key) result[key] += 1; }
    return result;
  }, [conversations, userId]);

  // Primeira abertura: começa em Novos se houver fila; senão em Meus; senão em Todas.
  useEffect(() => {
    if (tab || !conversations.length) return;
    setTab(counts.novos ? 'novos' : counts.meus ? 'meus' : 'todas');
  }, [tab, conversations.length, counts]);
  const activeTab: InboxTab = tab ?? 'todas';

  const term = search.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const filtered = conversations.filter(item => {
    if (activeTab !== 'todas' && inboxTabOf(item, userId) !== activeTab) return false;
    if (unreadOnly && item.unread_count === 0) return false;
    if (status && item.status !== status) return false;
    if (channel && item.channel !== channel) return false;
    if (!term) return true;
    const name = (item.contacts?.full_name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return name.includes(term) || (item.contacts?.phone_e164 ?? '').includes(term.replace(/\D/g, '') || '\u0000');
  });
  const unreadTotal = conversations.filter(item => item.unread_count > 0).length;
  const filtersOn = unreadOnly || Boolean(status) || Boolean(channel);
  // Canais com conversa ou conectados; o filtro aparece quando há mais de um.
  const channelsInUse = CHANNEL_ORDER.filter(key => connectedChannels.includes(key) || conversations.some(item => item.channel === key));
  const channelCount = (key: ChannelKey) => conversations.filter(item => item.channel === key).length;

  return <>
    <header className="px-3 pb-3 pt-4 sm:px-4 sm:pt-5">
      <div className="flex items-center justify-between px-1">
        <div><p className="text-xl font-bold tracking-tight text-tendi-navy">Atendimento</p><p className="mt-0.5 text-xs text-slate-500">{conversations.length} conversas{unreadTotal > 0 && <> · <b className="font-semibold text-tendi-magenta">{unreadTotal} não lidas</b></>}</p></div>
        <button onClick={onRefresh} className="td-icon-btn border border-tendi-line bg-white" title="Atualizar" aria-label="Atualizar conversas"><RefreshCw size={15} /></button>
      </div>

      <div role="tablist" aria-label="Filas de atendimento" className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-tendi-haze p-1 ring-1 ring-inset ring-tendi-line/80">
        {TABS.map(item => {
          const active = activeTab === item.key;
          const count = counts[item.key];
          return <button key={item.key} type="button" role="tab" aria-selected={active} title={item.hint} onClick={() => setTab(item.key)} className={active ? 'td-tab td-tab-active min-h-10 justify-center px-1 text-[12px]' : 'td-tab justify-center px-1 text-[12px]'}>
            {item.label}
            {item.key !== 'todas' && count > 0 && <span className={item.key === 'novos' ? 'min-w-[18px] rounded-full bg-tendi-magenta px-1.5 text-[10px] font-bold leading-[18px] text-white' : 'min-w-[18px] rounded-full bg-tendi-navy px-1.5 text-[10px] font-bold leading-[18px] text-white'}>{count}</span>}
          </button>;
        })}
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-2">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-tendi-line bg-white px-3 transition hover:border-slate-300 focus-within:border-tendi-lilac focus-within:shadow-focus">
          <Search size={15} className="shrink-0 text-slate-400" />
          <input placeholder="Buscar nome ou telefone" value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 w-full bg-transparent text-base sm:text-[13px] outline-none placeholder:text-slate-400" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" className="text-slate-400 hover:text-slate-600"><X size={14} /></button>}
        </label>
        <button type="button" onClick={() => setShowFilters(open => !open)} aria-expanded={showFilters} aria-label="Filtros" title="Filtros" className={filtersOn ? 'relative flex size-11 items-center justify-center rounded-xl bg-tendi-indigo text-white shadow-card' : 'relative flex size-10 items-center justify-center rounded-xl border border-tendi-line bg-white text-slate-500 transition hover:text-tendi-indigo'}><SlidersHorizontal size={15} /></button>
      </div>
      {channel && !showFilters && <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><ChannelBadge channel={channel} className="size-4" />Só {CHANNEL_INFO[channel].label}<button type="button" onClick={() => setChannel('')} className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:text-tendi-navy" aria-label="Limpar filtro de canal"><X size={12} /></button></div>}
      {showFilters && <div className="mt-2 animate-pop space-y-3 rounded-xl border border-tendi-line bg-tendi-haze/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} className="accent-tendi-magenta" />Só não lidas</label>
          <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)} className="ml-auto h-8 rounded-lg border border-tendi-line bg-white px-2 text-xs text-slate-600 outline-none focus:border-tendi-lilac">{STATUS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </div>
        {channelsInUse.length > 1 && <div role="group" aria-label="Filtrar por canal" className="flex flex-wrap gap-1.5 border-t border-tendi-line/70 pt-3">
          <button type="button" onClick={() => setChannel('')} aria-pressed={!channel} className={!channel ? 'rounded-full bg-tendi-navy px-3 py-1 text-[11px] font-semibold text-white' : 'rounded-full border border-tendi-line bg-white px-3 py-1 text-[11px] font-medium text-slate-500 hover:text-tendi-navy'}>Todos os canais</button>
          {channelsInUse.map(key => <button key={key} type="button" onClick={() => setChannel(current => current === key ? '' : key)} aria-pressed={channel === key} className={channel === key ? 'inline-flex items-center gap-1.5 rounded-full bg-tendi-navy py-1 pl-1 pr-3 text-[11px] font-semibold text-white' : 'inline-flex items-center gap-1.5 rounded-full border border-tendi-line bg-white py-1 pl-1 pr-3 text-[11px] font-medium text-slate-600 hover:text-tendi-navy'}><ChannelBadge channel={key} className="size-[18px]" />{CHANNEL_INFO[key].label}<span className={channel === key ? 'text-white/70' : 'text-slate-400'}>{channelCount(key)}</span></button>)}
        </div>}
      </div>}
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto border-t border-tendi-line/70 px-2 py-2">
      {filtered.map(item => {
        const selected = selectedId === item.id;
        const handoffWaitMinutes = item.ai_mode === 'handoff' && item.last_message_at ? Math.max(0, Math.floor((Date.now() - new Date(item.last_message_at).getTime()) / 60_000)) : null;
        const tags = conversationTags({ aiMode: item.ai_mode, contactTags: item.contacts?.tags, handoffWaitMinutes });
        const unread = item.unread_count > 0;
        const owner = item.assigned_to && item.assigned_to !== userId ? memberNames[item.assigned_to] : null;
        return <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={selected ? 'relative mb-0.5 flex w-full gap-3 rounded-2xl bg-tendi-mist px-3 py-3.5 text-left ring-1 ring-inset ring-tendi-indigo/[.06]' : 'relative mb-0.5 flex w-full gap-3 rounded-2xl px-3 py-3.5 text-left transition hover:bg-tendi-haze'}>
          {selected && <span className="absolute inset-y-3 -left-2 w-[3px] rounded-r-full bg-tendi-magenta" />}
          <ContactAvatar contactId={item.contact_id} name={item.contacts?.full_name} className="size-11 rounded-full text-[12px]" channel={item.channel} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className={unread ? 'truncate text-[14px] font-semibold text-tendi-navy' : 'truncate text-[14px] font-medium text-slate-700'}>{item.contacts?.full_name ?? 'Contato'}</p>
              {item.teams && <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${item.teams.color}1F`, color: item.teams.color }}>{item.teams.name}</span>}
            </div>
            {tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{tags.slice(0, 3).map(tag => <span key={tag.label} className={`rounded px-1.5 py-[3px] text-[9.5px] font-bold uppercase leading-none tracking-wide ${tag.className}`}>{tag.label}</span>)}{tags.length > 3 && <span className="rounded bg-slate-200 px-1.5 py-[3px] text-[9.5px] font-bold leading-none text-slate-600">+{tags.length - 3}</span>}</div>}
            <div className="mt-1 flex items-center gap-2">
              <p className={unread ? 'min-w-0 flex-1 truncate text-[12.5px] font-medium text-tendi-indigo' : 'min-w-0 flex-1 truncate text-[12.5px] text-slate-500'}>{preview(item.id)}</p>
              <span className={unread ? 'shrink-0 text-[11px] font-semibold text-tendi-magenta' : 'shrink-0 text-[11px] text-slate-400'}>{relativeTime(item.last_message_at)}</span>
              {unread && <span className="flex min-w-[20px] shrink-0 items-center justify-center rounded-full bg-tendi-magenta px-1.5 text-[11px] font-bold leading-5 text-white shadow-[0_2px_6px_-2px_rgba(203,10,159,.6)]">{item.unread_count}</span>}
            </div>
            {owner && <p className="mt-1 text-[11px] text-slate-500">Com <b className="font-semibold text-slate-700">{owner}</b></p>}
          </div>
        </button>;
      })}
      {!filtered.length && <div className="px-6 py-12 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-tendi-lilac shadow-card ring-1 ring-tendi-line"><MessageCircle size={22} /></div><p className="mt-4 text-sm font-semibold text-tendi-navy">{activeTab === 'novos' ? 'Nenhuma conversa na fila' : activeTab === 'meus' ? 'Nenhuma conversa com você' : 'Nenhuma conversa encontrada'}</p><p className="mt-1 text-xs leading-5 text-slate-400">{activeTab === 'novos' ? 'Conversas sem responsável aparecem aqui.' : 'Troque de aba ou ajuste a busca.'}</p></div>}
    </div>
    <div className="flex items-center gap-2 border-t border-tendi-line/70 px-4 py-2.5 text-[10.5px] text-slate-400"><span className="size-1.5 rounded-full bg-emerald-500" />Atualização em tempo real</div>
  </>;
}
