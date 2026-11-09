'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, MessageCircle, Server, Webhook, LockKeyhole, CircleCheck, Clock3, ExternalLink, AlertTriangle, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function AdminWhatsAppPage() {
  const supabase = createClient() as any;
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
      if (!active) return;
      if (!admin) { setAuthorized(false); setLoading(false); return; }
      setAuthorized(true);
      const { count } = await supabase.from('channel_connections').select('id', { count: 'exact', head: true }).eq('channel', 'whatsapp');
      if (active) { setConnections(count ?? 0); setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [supabase]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] text-[#2F316B]">Carregando configurações...</main>;
  if (!authorized) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto text-[#CB0A9F]" size={32}/><h1 className="mt-4 text-xl font-semibold text-[#2F316B]">Acesso restrito</h1><p className="mt-2 text-sm text-slate-500">Somente o Super Admin pode gerenciar provedores de conectividade.</p><a href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#004751]">Voltar ao Tendi</a></div></main>;

  return <main className="min-h-screen bg-[#F6F7FB] p-5 text-slate-800 md:p-8">
    <div className="mx-auto max-w-5xl">
      <a href="/admin" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#2F316B]"><ArrowLeft size={15}/>Voltar ao Console</a>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#CB0A9F]">Console Super Admin</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#25275B]">Conectividade WhatsApp</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Gerencie a estratégia de integração e acompanhe as conexões dos workspaces sem expor credenciais aos clientes.</p></div><span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"><Clock3 size={14}/>Provedor em avaliação</span></header>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5"><div className="flex items-start gap-4"><span className="rounded-2xl bg-[#E8F4F2] p-4 text-[#004751]"><MessageCircle size={26}/></span><div><h2 className="text-lg font-bold text-[#25275B]">D-API Cloud</h2><p className="mt-1 text-xs text-slate-500">Provedora considerada para a camada de conexão WhatsApp do Tendi.</p><a href="https://d-api.cloud/" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#004751] hover:underline">Acessar site da provedora <ExternalLink size={13}/></a></div></div><span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Não contratada / não configurada</span></div>
        <div className="mt-7 grid gap-3 md:grid-cols-3"><Info icon={Server} title="Provedor" value="D-API Cloud · planejada"/><Info icon={Webhook} title="Webhooks" value="Aguardando documentação e homologação"/><Info icon={LockKeyhole} title="Credenciais" value="Nenhuma chave armazenada"/></div>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={18}/><div><p className="text-xs font-bold text-amber-900">Integração ainda não ativada</p><p className="mt-1 text-xs leading-5 text-amber-800">Esta tela registra a decisão arquitetural inicial. Antes de ativar, confirme com a D-API o modelo de sessão, API de provisionamento, autenticação, eventos de webhook, limites, política de reconexão, suporte e modalidade oficial ou por QR Code. Nenhuma conexão ou envio será simulado.</p></div></div></div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><CircleCheck className="text-[#004751]" size={18}/><h3 className="text-sm font-bold text-[#25275B]">Experiência do cliente</h3></div><ul className="mt-4 space-y-2 text-xs leading-5 text-slate-500"><li>• Conectar número por fluxo guiado dentro do workspace.</li><li>• Exibir QR Code ou autorização apenas quando a API real responder.</li><li>• Confirmar conexão e identificar o número conectado.</li><li>• Permitir reconexão e mostrar erros com instruções claras.</li><li>• Liberar o Inbox após confirmação do provedor e do webhook.</li></ul></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="text-[#004751]" size={18}/><h3 className="text-sm font-bold text-[#25275B]">Controles do Super Admin</h3></div><ul className="mt-4 space-y-2 text-xs leading-5 text-slate-500"><li>• Credenciais mantidas exclusivamente no servidor.</li><li>• Provisionamento isolado por organização.</li><li>• Monitoramento de sessão, webhook e falhas.</li><li>• Limites de números e recursos por plano.</li><li>• Logs técnicos sem armazenar tokens em texto aberto.</li></ul></article>
      </section>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-[#25275B]">Conexões WhatsApp cadastradas</h3><p className="mt-1 text-xs text-slate-400">Total registrado em todos os workspaces visíveis ao Super Admin.</p></div><strong className="text-2xl text-[#2F316B]">{connections}</strong></div><p className="mt-3 text-[11px] leading-5 text-slate-400">O total é apenas uma contagem dos registros existentes em channel_connections; não representa sessões ativas na provedora.</p></section>
    </div>
  </main>;
}

function Info({icon:Icon,title,value}:{icon:React.ElementType;title:string;value:string}) { return <div className="rounded-xl bg-[#F7F8FC] p-4"><Icon size={17} className="text-[#2F316B]"/><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p><p className="mt-1 text-xs font-semibold text-slate-700">{value}</p></div>; }
