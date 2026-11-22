'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, X } from 'lucide-react';
import { EnablePushButton } from '@/components/enable-push-button';
import { createClient } from '@/lib/supabase/client';
import { withOrganization } from '@/lib/current-organization';

type Notice = {
  id: string;
  title: string;
  body: string | null;
  target_path: string | null;
  created_at: string;
  read_at: string | null;
};

function safePath(path: string | null, organizationId: string) {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return withOrganization('/inbox', organizationId);
  return withOrganization(path, organizationId);
}

export function NotificationBell({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    // The table is introduced by the separately deployed notification migration.
    const db = supabase as any;
    const { data, error } = await db.from('notifications')
      .select('id,title,body,target_path,created_at,read_at')
      .eq('organization_id', organizationId)
      .eq('recipient_user_id', auth.user.id)
      .order('created_at', { ascending: false }).limit(30);
    if (error) { setAvailable(false); setItems([]); setUnread(0); return; }
    setAvailable(true);
    const notices = (data ?? []) as Notice[];
    setItems(notices);
    setUnread(notices.filter(item => !item.read_at).length);
  }, [organizationId]);

  useEffect(() => {
    setItems([]);
    setUnread(0);
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    const { error } = await (createClient() as any).from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .in('id', ids)
      .is('read_at', null);
    setBusy(false);
    if (!error) await load();
  }

  return <div className="relative">
    <button type="button" className="td-icon-btn relative" aria-label={unread ? `Notificações: ${unread} não lidas` : 'Notificações'} aria-expanded={open}
      onClick={() => { setOpen(value => !value); void load(); }}>
      <Bell size={19} />
      {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-tendi-magenta px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <>
      <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Fechar notificações" onClick={() => setOpen(false)} />
      <section className="absolute right-0 top-12 z-30 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-tendi-line bg-white shadow-pop" aria-label="Central de notificações">
        <div className="flex items-center justify-between border-b border-tendi-line px-4 py-3">
          <h2 className="text-sm font-semibold text-tendi-navy">Notificações</h2>
          <div className="flex items-center gap-2">
            {unread > 0 && <button type="button" disabled={busy} onClick={() => void markRead(items.filter(item => !item.read_at).map(item => item.id))} className="text-xs text-tendi-indigo hover:underline"><CheckCheck size={14} className="mr-1 inline" />Marcar lidas</button>}
            <button type="button" aria-label="Fechar" onClick={() => setOpen(false)}><X size={17} /></button>
          </div>
        </div>
        <EnablePushButton />
        <div className="max-h-[380px] overflow-y-auto">
          {!available ? <p className="p-5 text-sm text-slate-500">Notificações indisponíveis. A configuração do banco pode estar pendente.</p>
            : items.length === 0 ? <p className="p-5 text-sm text-slate-500">Nenhuma notificação por enquanto.</p>
            : items.map(item => <div key={item.id} className={`border-b border-tendi-line/60 px-4 py-3 last:border-0 ${item.read_at ? '' : 'bg-tendi-haze'}`}>
              <Link href={safePath(item.target_path, organizationId)} onClick={() => { setOpen(false); if (!item.read_at) void markRead([item.id]); }} className="block">
                <p className="text-sm font-semibold text-tendi-navy">{item.title}</p>
                {item.body && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.body}</p>}
                <time className="mt-1 block text-[11px] text-slate-400" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('pt-BR')}</time>
              </Link>
            </div>)}
        </div>
      </section>
    </>}
  </div>;
}
