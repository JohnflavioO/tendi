'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, MessageCircle, Server, Webhook, LockKeyhole, CircleCheck, Clock3, ExternalLink, AlertTriangle, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AdminShell } from '@/components/admin/admin-shell';
import type { WhatsappProviderSummary } from '@/lib/dapi';
import { DapiWebhookSync } from '@/components/admin/dapi-webhook-sync';

export default function AdminWhatsAppPage() {
  const supabase = createClient() as any;
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState(0);
  const [provider, setProvider] = useState<WhatsappProviderSummary | null>(null);
  const [providerError, setProviderError] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
      if (!active) return;
      if (!admin) { setAuthorized(false); setLoading(false); return; }
      setAuthorized(true);
      try {
        const response = await fetch('/api/admin/whatsapp/webhooks', { cache: 'no-store' });
        if (!response.ok) throw new Error('Configuração indisponível');
        const data = await response.json();
        if (active) setProvider(data.provider ?? null);
      } catch { if (active) setProviderError(true); }
      const { count } = await supabase.from('channel_connections').select('id', { count: 'exact', head: true }).eq('channel', 'whatsapp');
      if (active) { setConnections(count ?? 0); setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [supabase]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-tendi-haze text-tendi-indigo">Carregando configurações...</main>;
  if (!authorized) return <main className="grid min-h-screen place-items-center bg-tendi-haze p-6"><div className="td-card p-8 text-center"><ShieldCheck className="mx-auto text-tendi-magenta" size={32}/><h1 className="mt-4 text-xl font-semibold tracking-tight text-tendi-navy">Acesso restrito</h1><p className="mt-2 text-sm text-slate-500">Somente o Super Admin pode gerenciar provedores de conectividade.</p><a href="/inbox" className="mt-5 inline-block text-sm font-semibold text-tendi-teal">Voltar ao TendiDesk</a></div></main>;

  return <AdminShell title="Conectividade WhatsApp">
    <div>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-tendi-magenta">Console Super Admin</p><h1 className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-tendi-navy">Conectividade WhatsApp</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Gerencie a estratégia de integração e acompanhe as conexões dos workspaces sem expor credenciais aos clientes.</p></div><span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"><Clock3 size={14}/>Integração por QR Code</span></header>

      <section className="td-card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5"><div className="flex items-start gap-4"><span className="rounded-2xl bg-tendi-tealsoft p-4 text-tendi-teal"><MessageCircle size={26}/></span><div><h2 className="text-lg font-semibold tracking-tight text-tendi-navy">{provider?.name ?? 'Provedor WhatsApp'}</h2><p className="mt-1 text-xs text-slate-500">Conectividade WhatsApp Web com uma sessão independente por workspace.</p><span className="mt-3 inline-block">{provider?.website && <a href={provider.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-tendi-teal hover:underline">Acessar provedor <ExternalLink size={13}/></a>}</span></div></div><span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Configuração via ambiente</span></div>
        <div className="mt-7 grid gap-3 md:grid-cols-3"><Info icon={Server} title="Provedor" value={provider ? `${provider.name} · QR Code` : 'Consultando configuração…'}/><Info icon={Webhook} title="Webhooks" value="Mensagens e atualizações de entrega"/><Info icon={LockKeyhole} title="Credenciais" value={provider ? (provider.keyConfigured ? 'Configuradas no servidor' : 'Configuração pendente') : 'Não verificadas'}/></div>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={18}/><div><p className="text-xs font-bold text-amber-900">Configuração centralizada e segura</p><p className="mt-1 text-xs leading-5 text-amber-800">O provedor é definido no servidor. Cada workspace conecta seu próprio número por QR Code, sem compartilhar a chave da plataforma. Os webhooks sincronizam mensagens e atualizações de entrega com o Inbox.</p></div></div></div>
      </section>

      {providerError && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-xs text-amber-800">Não foi possível consultar a configuração do provedor. Atualize a página para tentar novamente.</p>}
      <DapiWebhookSync />
      <section className="mt-5 grid gap-4 md:grid-cols-2">
        <article className="td-card p-5"><div className="flex items-center gap-2"><CircleCheck className="text-tendi-teal" size={18}/><h3 className="td-title">Experiência do cliente</h3></div><ul className="mt-4 space-y-2 text-xs leading-5 text-slate-500"><li>• Conectar número por fluxo guiado dentro do workspace.</li><li>• Exibir QR Code ou autorização apenas quando a API real responder.</li><li>• Confirmar conexão e identificar o número conectado.</li><li>• Permitir reconexão e mostrar erros com instruções claras.</li><li>• Liberar o Inbox após confirmação do provedor e do webhook.</li></ul></article>
        <article className="td-card p-5"><div className="flex items-center gap-2"><ShieldCheck className="text-tendi-teal" size={18}/><h3 className="td-title">Controles do Super Admin</h3></div><ul className="mt-4 space-y-2 text-xs leading-5 text-slate-500"><li>• Credenciais mantidas exclusivamente no servidor.</li><li>• Provisionamento isolado por organização.</li><li>• Monitoramento de sessão, webhook e falhas.</li><li>• Limites de números e recursos por plano.</li><li>• Logs técnicos sem armazenar tokens em texto aberto.</li></ul></article>
      </section>
      <section className="mt-5 td-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="td-title">Conexões WhatsApp cadastradas</h3><p className="mt-1 text-xs text-slate-400">Conexões registradas nos workspaces da plataforma.</p></div><strong className="text-2xl text-tendi-indigo">{connections}</strong></div><p className="mt-3 text-[11px] leading-5 text-slate-400">Total de conexões cadastradas; o status operacional de cada número é consultado no provedor.</p></section>
    </div>
  </AdminShell>;
}

function Info({icon:Icon,title,value}:{icon:React.ElementType;title:string;value:string}) { return <div className="rounded-xl bg-tendi-haze p-4"><Icon size={17} className="text-tendi-indigo"/><p className="mt-3 td-eyebrow">{title}</p><p className="mt-1 text-xs font-semibold text-slate-700">{value}</p></div>; }
