'use client';

import { useEffect, useState } from 'react';
import { Bot, MessageCircle, Instagram, Facebook, Globe2, Loader2, Smartphone, ShieldCheck, ArrowRight, RefreshCw, Unplug, QrCode, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceShell } from '@/components/workspace-shell';

type Connection={id:string;channel:string;display_name:string;status:string;phone_number_id:string|null;updated_at:string};
type QrPayload={status:string;qrCode?:string|null;qrCodeImage?:string|null;qrCodeUpdatedAt?:string|null;displayName?:string};
const channels=[{id:'instagram',name:'Instagram',detail:'Mensagens diretas do Instagram',icon:Instagram},{id:'messenger',name:'Messenger',detail:'Conversas da página do Facebook',icon:Facebook},{id:'webchat',name:'Webchat',detail:'Widget de atendimento para seu site',icon:Globe2}];
const statusLabel=(status:string)=>status==='connected'?'Conectado':status==='error'?'Atenção necessária':status==='pending'?'Aguardando leitura do QR Code':status==='disconnected'?'Desconectado':status;

export default function ChatbotsPage(){
 const supabase=createClient() as any;
 const [rows,setRows]=useState<Connection[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [workspace,setWorkspace]=useState('');
 const [organizationId,setOrganizationId]=useState('');
 const [qr,setQr]=useState<QrPayload|null>(null);
 const [notice,setNotice]=useState('');

 async function load(){
  const {data:u}=await supabase.auth.getUser();if(!u.user){window.location.assign('/login');return;}
  const requested=new URLSearchParams(window.location.search).get('organization');
  const {data:orgs,error:orgError}=await supabase.from('organizations').select('id,name').order('name');
  if(orgError)throw orgError;
  const selected=orgs?.find((o:any)=>o.id===requested)??orgs?.[0];
  if(!selected){setLoading(false);return;}
  setWorkspace(selected.name);setOrganizationId(selected.id);
  const {data,error:e}=await supabase.from('channel_connections').select('id,channel,display_name,status,phone_number_id,updated_at').eq('organization_id',selected.id);
  if(e)throw e;
  setRows(data??[]);setLoading(false);
 }
 useEffect(()=>{void load().catch(e=>{setError(e.message);setLoading(false)});},[]);

 async function requestApi(action:string,method:'GET'|'POST'='GET'){
  if(!organizationId)throw new Error('Workspace não encontrado.');
  const response=await fetch(`/api/whatsapp/${action}?organizationId=${encodeURIComponent(organizationId)}`,{method,headers:{'Content-Type':'application/json'}});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error??'Não foi possível concluir a operação.');
  return payload;
 }
 async function connect(){
  setBusy(true);setError('');setNotice('');
  try{const payload=await requestApi('connect','POST');setQr(payload);await load();}
  catch(e){setError(e instanceof Error?e.message:'Falha ao conectar com a D-API.');}
  finally{setBusy(false);}
 }
 async function refreshQr(){
  setBusy(true);setError('');
  try{const payload=await requestApi('qr');setQr(payload);const current=await requestApi('status');if(current.status==='connected'){setQr(null);setNotice('WhatsApp conectado com sucesso.');}await load();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o QR Code.');}
  finally{setBusy(false);}
 }
 async function disconnect(){
  if(!window.confirm('Deseja realmente desconectar este WhatsApp?'))return;
  setBusy(true);setError('');
  try{await requestApi('disconnect','POST');setQr(null);setNotice('WhatsApp desconectado.');await load();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível desconectar.');}
  finally{setBusy(false);}
 }
 const whatsapp=rows.find(r=>r.channel==='whatsapp');
 const connected=whatsapp?.status==='connected';
 return <WorkspaceShell title="Canais e automações" description="Conecte seus canais e organize os atendimentos do workspace">
  <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#25275B] via-[#2F316B] to-[#004751] p-6 text-white shadow-sm md:p-8">
   <div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/80"><Bot size={13}/> Central de canais Tendi</span><h1 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">Seu atendimento, em um só lugar.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Conecte os canais da sua empresa para receber e responder mensagens pela equipe, com histórico centralizado no Inbox.</p></div><div className="rounded-2xl border border-white/15 bg-white/10 p-4"><MessageCircle size={30}/><p className="mt-3 text-[10px] font-semibold text-white/70">{workspace||'Workspace ativo'}</p></div></div>
  </section>
  {error&&<p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
  {notice&&<p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}
  {loading?<div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-[#2F316B]"/></div>:<>
   <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-4"><span className="rounded-2xl bg-[#E8F6EF] p-4 text-[#16834C]"><MessageCircle size={27}/></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-[#25275B]">WhatsApp</h2><span className={connected?'rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700':'rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700'}>{statusLabel(whatsapp?.status??'disconnected')}</span></div><p className="mt-1 text-xs text-slate-500">Conecte seu WhatsApp pelo QR Code, sem compartilhar códigos ou chaves com a equipe Tendi.</p><p className="mt-2 text-xs font-semibold text-slate-700">{whatsapp?.display_name??'Nenhum número conectado'}</p></div></div>
     <div className="flex flex-wrap gap-2">{connected?<button onClick={disconnect} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Unplug size={15}/>Desconectar</button>:<button onClick={connect} disabled={busy||!organizationId} className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-xs font-semibold text-white transition hover:bg-[#003B44] disabled:opacity-50">{busy?<Loader2 size={15} className="animate-spin"/>:<QrCode size={15}/>} {whatsapp?.status==='pending'?'Continuar conexão':'Conectar com QR Code'}<ArrowRight size={14}/></button>}</div>
    </div>
    {qr?.qrCodeImage&&<div className="mt-6 grid gap-5 rounded-2xl border border-slate-200 bg-[#F8FAFC] p-5 md:grid-cols-[190px_1fr] md:items-center"><div className="mx-auto rounded-2xl border border-slate-200 bg-white p-3"><img src={qr.qrCodeImage} alt="QR Code para conectar o WhatsApp" className="size-44 object-contain"/></div><div><div className="flex items-center gap-2 text-sm font-bold text-[#25275B]"><QrCode size={17}/>Leia o QR Code no WhatsApp</div><ol className="mt-3 list-inside list-decimal space-y-2 text-xs leading-5 text-slate-600"><li>Abra o WhatsApp no celular que deseja conectar.</li><li>Acesse <strong>Dispositivos conectados</strong> e toque em <strong>Conectar dispositivo</strong>.</li><li>Escaneie o QR Code exibido nesta tela.</li></ol><div className="mt-4 flex flex-wrap items-center gap-2"><button onClick={refreshQr} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#004751] ring-1 ring-slate-200 disabled:opacity-50"><RefreshCw size={14}/>Atualizar QR / status</button><span className="text-[10px] text-slate-400">QR Code temporário. Atualize se expirar.</span></div></div></div>}
    {connected&&<div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800"><CheckCircle2 size={16}/>Sessão confirmada pela D-API.</div>}
    <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-3"><Step number="01" title="Inicie a conexão" detail="O Tendi cria uma sessão exclusiva para este workspace."/><Step number="02" title="Leia o QR Code" detail="Autorize o acesso pelo menu Dispositivos conectados do WhatsApp."/><Step number="03" title="Confirme o status" detail="O Tendi consulta a sessão diretamente na D-API." /></div>
   </section>
   <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-[#25275B]">Outros canais</h2><p className="mt-1 text-xs text-slate-400">Expanda sua operação para novos pontos de contato.</p></div><span className="text-[10px] font-medium text-slate-400">{channels.length} canais planejados</span></div>
   <div className="grid gap-4 md:grid-cols-3">{channels.map(c=>{const connection=rows.find(r=>r.channel===c.id);const Icon=c.icon;return <article key={c.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><span className="rounded-xl bg-[#F0F0FA] p-3 text-[#2F316B]"><Icon size={20}/></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">{connection?statusLabel(connection.status):'Planejado'}</span></div><h3 className="mt-4 text-sm font-bold text-[#2F316B]">{c.name}</h3><p className="mt-1 min-h-10 text-[11px] leading-5 text-slate-400">{c.detail}</p><div className="mt-4 border-t border-slate-100 pt-3 text-[10px] text-slate-400">{connection?.display_name??'Disponibilidade em uma próxima etapa'}</div></article>})}</div>
   <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"><ShieldCheck className="mt-0.5 shrink-0 text-[#004751]" size={18}/><p className="text-[11px] leading-5 text-slate-500">A chave da D-API fica exclusivamente no servidor. Cada workspace possui uma sessão independente e só pode consultar ou desconectar a própria conexão. A integração de recebimento de mensagens no Inbox depende da homologação dos eventos de webhook.</p></div>
  </>}
 </WorkspaceShell>;
}
function Step({number,title,detail}:{number:string;title:string;detail:string}){return <div className="flex gap-3 rounded-xl bg-[#F7F8FC] p-3"><span className="text-xs font-bold text-[#CB0A9F]">{number}</span><div><p className="text-xs font-semibold text-[#2F316B]">{title}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{detail}</p></div></div>}
