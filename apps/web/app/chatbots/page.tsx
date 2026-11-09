'use client';

import { useEffect, useState } from 'react';
import { Bot, MessageCircle, Instagram, Facebook, Globe2, Loader2, Smartphone, ShieldCheck, ArrowRight, Clock3 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceShell } from '@/components/workspace-shell';

type Connection={id:string;channel:string;display_name:string;status:string;phone_number_id:string|null;updated_at:string};
const channels=[{id:'instagram',name:'Instagram',detail:'Mensagens diretas do Instagram',icon:Instagram},{id:'messenger',name:'Messenger',detail:'Conversas da página do Facebook',icon:Facebook},{id:'webchat',name:'Webchat',detail:'Widget de atendimento para seu site',icon:Globe2}];
const statusLabel=(status:string)=>status==='connected'?'Conectado':status==='error'?'Atenção necessária':status==='pending'?'Em configuração':status==='disconnected'?'Desconectado':status;
export default function ChatbotsPage(){
 const supabase=createClient() as any;
 const [rows,setRows]=useState<Connection[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [workspace,setWorkspace]=useState('');
 const [showGuide,setShowGuide]=useState(false);
 async function load(){
  const {data:u}=await supabase.auth.getUser();if(!u.user){window.location.assign('/login');return;}
  const params=new URLSearchParams(window.location.search);
  const requested=params.get('organization');
  const {data:orgs,error:orgError}=await supabase.from('organizations').select('id,name').order('name');
  if(orgError)throw orgError;
  const selected=orgs?.find((o:any)=>o.id===requested)??orgs?.[0];
  if(!selected){setLoading(false);return;}
  setWorkspace(selected.name);
  const {data,error:e}=await supabase.from('channel_connections').select('id,channel,display_name,status,phone_number_id,updated_at').eq('organization_id',selected.id);
  if(e)throw e;
  setRows(data??[]);setLoading(false);
 }
 useEffect(()=>{void load().catch(e=>{setError(e.message);setLoading(false)});},[]);
 const whatsapp=rows.find(r=>r.channel==='whatsapp');
 const connected=whatsapp?.status==='connected';
 return <WorkspaceShell title="Canais e automações" description="Conecte seus canais e organize os atendimentos do workspace">
  <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#25275B] via-[#2F316B] to-[#004751] p-6 text-white shadow-sm md:p-8">
   <div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/80"><Bot size={13}/> Central de canais Tendi</span><h1 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">Seu atendimento, em um só lugar.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Conecte os canais da sua empresa para receber e responder mensagens pela equipe, com histórico centralizado no Inbox.</p></div><div className="rounded-2xl border border-white/15 bg-white/10 p-4"><MessageCircle size={30}/><p className="mt-3 text-[10px] font-semibold text-white/70">{workspace||'Workspace ativo'}</p></div></div>
  </section>
  {error&&<p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
  {loading?<div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-[#2F316B]"/></div>:<>
   <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-4"><span className="rounded-2xl bg-[#E8F6EF] p-4 text-[#16834C]"><MessageCircle size={27}/></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-[#25275B]">WhatsApp</h2><span className={connected?'rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700':'rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700'}>{connected?'Conectado':whatsapp?.status==='error'?'Atenção necessária':whatsapp?.status==='pending'?'Em configuração':'Aguardando ativação'}</span></div><p className="mt-1 text-xs text-slate-500">Canal principal para conversar com seus clientes diretamente pelo Tendi.</p><p className="mt-2 text-xs font-semibold text-slate-700">{whatsapp?.display_name??'Nenhum número conectado'}</p>{whatsapp?.phone_number_id&&<p className="mt-1 text-[10px] text-slate-400">Número registrado na conexão</p>}</div></div>
     <button onClick={()=>setShowGuide(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-xs font-semibold text-white transition hover:bg-[#003B44]"><Smartphone size={15}/>{connected?'Ver conexão':'Conectar número'}<ArrowRight size={14}/></button>
    </div>
    <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-3"><Step number="01" title="Informe o número" detail="Escolha o WhatsApp comercial que será usado no atendimento."/><Step number="02" title="Autorize a conexão" detail="Siga a autorização guiada apresentada pelo Tendi."/><Step number="03" title="Comece a atender" detail="Após a confirmação, o canal aparece no Inbox da equipe."/></div>
    {!connected&&<div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#F7F8FC] p-4"><Clock3 size={17} className="mt-0.5 shrink-0 text-[#2F316B]"/><p className="text-[11px] leading-5 text-slate-500">A conexão automática está sendo preparada. Assim que a integração for habilitada pelo administrador da plataforma, você poderá conectar seu número por este fluxo sem configurar tokens ou serviços externos.</p></div>}
   </section>
   <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-[#25275B]">Outros canais</h2><p className="mt-1 text-xs text-slate-400">Expanda sua operação para novos pontos de contato.</p></div><span className="text-[10px] font-medium text-slate-400">{channels.length} canais planejados</span></div>
   <div className="grid gap-4 md:grid-cols-3">{channels.map(c=>{const connection=rows.find(r=>r.channel===c.id);const Icon=c.icon;return <article key={c.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><span className="rounded-xl bg-[#F0F0FA] p-3 text-[#2F316B]"><Icon size={20}/></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">{connection?statusLabel(connection.status):'Planejado'}</span></div><h3 className="mt-4 text-sm font-bold text-[#2F316B]">{c.name}</h3><p className="mt-1 min-h-10 text-[11px] leading-5 text-slate-400">{c.detail}</p><div className="mt-4 border-t border-slate-100 pt-3 text-[10px] text-slate-400">{connection?.display_name??'Disponibilidade em uma próxima etapa'}</div></article>})}</div>
   <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"><ShieldCheck className="mt-0.5 shrink-0 text-[#004751]" size={18}/><p className="text-[11px] leading-5 text-slate-500">A conexão será gerenciada pelo Tendi. Você não precisará acessar painel de provedor, configurar webhooks ou compartilhar chaves de API. O status exibido será atualizado a partir da confirmação real do serviço.</p></div>
  </>}
  {showGuide&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="whatsapp-guide-title" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl md:p-7"><div className="flex items-start justify-between"><div><span className="rounded-xl bg-[#E8F6EF] p-3 text-[#16834C] inline-flex"><MessageCircle size={22}/></span><h2 id="whatsapp-guide-title" className="mt-4 text-xl font-bold text-[#25275B]">{connected?'Detalhes da conexão':'Conectar WhatsApp'}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{connected?'Seu canal está registrado no workspace.':'O processo de conexão guiada ficará disponível assim que o administrador ativar o serviço de conectividade.'}</p></div><button onClick={()=>setShowGuide(false)} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">×</button></div>
   <div className="mt-5 space-y-3">{[['Número comercial','Tenha em mãos o telefone que será conectado.'],['Acesso ao aparelho','Você precisará autorizar a conexão no próprio WhatsApp, conforme o método habilitado.'],['Conexão confirmada','O Tendi validará o canal antes de liberar o atendimento.']].map(([title,detail],i)=><div key={title} className="flex gap-3 rounded-xl bg-[#F7F8FC] p-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-[11px] font-bold text-[#2F316B]">{i+1}</span><div><p className="text-xs font-semibold text-slate-700">{title}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p></div></div>)}</div>
   <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">A ativação automática ainda não está liberada. Não solicite QR Code nem informe códigos de verificação fora do fluxo oficial do Tendi.</div>
   <button onClick={()=>setShowGuide(false)} className="mt-5 w-full rounded-xl bg-[#004751] py-3 text-xs font-semibold text-white">Entendi</button>
  </section></div>}
 </WorkspaceShell>;
}
function Step({number,title,detail}:{number:string;title:string;detail:string}){return <div className="flex gap-3 rounded-xl bg-[#F7F8FC] p-3"><span className="text-xs font-bold text-[#CB0A9F]">{number}</span><div><p className="text-xs font-semibold text-[#2F316B]">{title}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{detail}</p></div></div>}
