'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, Loader2, ShieldCheck, ArrowRight, RefreshCw, Unplug, QrCode, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceShell } from '@/components/workspace-shell';
import { QRCodeSVG } from 'qrcode.react';
import { useWorkspaceRole } from '@/lib/use-workspace-role';
import { WebchatSettingsCard } from '@/components/chatbots/webchat-settings';
import { MetaConnectionCard } from '@/components/chatbots/meta-settings';

type Connection={id:string;channel:string;display_name:string;status:string;phone_number_id:string|null;provider_account_id:string|null;updated_at:string};
type QrPayload={status:string;waiting?:boolean;qrCode?:string|null;qrCodeImage?:string|null;qrCodeUpdatedAt?:string|null;displayName?:string;diagnostic?:{providerStatus?:string;qrCodePresent?:boolean;qrCodeImagePresent?:boolean;responseWrapped?:boolean;responseKeys?:string[];resourceKeys?:string[];providerError?:string|null;providerCode?:string|null}};
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
 const [qrPolling,setQrPolling]=useState(false);
 const [qrTimedOut,setQrTimedOut]=useState(false);
 const [notice,setNotice]=useState('');
 const qrStartedAt=useRef<number|null>(null);

 function applyQrPayload(next:QrPayload){
  setQr(current=>{
   const currentTime=current?.qrCodeUpdatedAt?Date.parse(current.qrCodeUpdatedAt):NaN;
   const nextTime=next.qrCodeUpdatedAt?Date.parse(next.qrCodeUpdatedAt):NaN;
   // Do not replace a newer QR with a delayed response from an earlier poll.
   if(Number.isFinite(currentTime)&&Number.isFinite(nextTime)&&nextTime<currentTime)return current;
   return next;
  });
 }

 async function load(){
  const {data:u}=await supabase.auth.getUser();if(!u.user){window.location.assign('/login');return;}
  const requested=new URLSearchParams(window.location.search).get('organization');
  // Resolve the workspace from the same active-membership rule enforced by the API.
  const {data:memberships,error:membershipError}=await supabase
   .from('organization_memberships')
   .select('organization_id')
   .eq('user_id',u.user.id)
   .eq('status','active');
  if(membershipError)throw membershipError;
  const allowedIds=(memberships??[]).map((m:any)=>m.organization_id).filter(Boolean);
  const {data:platformAdmin,error:adminError}=await supabase
   .from('platform_admins')
   .select('user_id')
   .eq('user_id',u.user.id)
   .maybeSingle();
  if(adminError)throw adminError;
  const isPlatformAdmin=Boolean(platformAdmin);
  if(!allowedIds.length&&!isPlatformAdmin){setLoading(false);throw new Error('Sua conta não possui vínculo ativo com este workspace. Solicite ao administrador a revisão do seu acesso.');}
  let orgQuery=supabase.from('organizations').select('id,name');
  if(!isPlatformAdmin)orgQuery=orgQuery.in('id',allowedIds);
  const {data:orgs,error:orgError}=await orgQuery.order('name');
  if(orgError)throw orgError;
  const selected=orgs?.find((o:any)=>o.id===requested)??orgs?.[0];
  if(!selected){setLoading(false);throw new Error('Nenhum workspace autorizado foi encontrado para sua conta.');}
  setWorkspace(selected.name);setOrganizationId(selected.id);
  const {data,error:e}=await supabase.from('channel_connections').select('id,channel,display_name,status,phone_number_id,provider_account_id,updated_at').eq('organization_id',selected.id);
  if(e)throw e;
  setRows(data??[]);setLoading(false);return selected.id;
 }
 useEffect(()=>{
  let active=true;
  void (async()=>{
   try{
    const id=await load();
    if(!active||!id)return;
    // Restore using the exact QR endpoint: its payload includes both QR and status.
    const payload=await requestApi('qr','GET',id);
    if(!active)return;
    if(payload.status==='connected'){
     setQr(null);
     setQrPolling(false);
     setNotice('WhatsApp conectado com sucesso.');
     await load();
     return;
    }
    applyQrPayload(payload);
    qrStartedAt.current=Date.now();
    setQrPolling(true);
   }catch(e){if(active)setError(e instanceof Error?e.message:'Não foi possível restaurar a conexão do WhatsApp.');}
  })();
  return ()=>{active=false;};
 },[]);

 async function requestApi(action:string,method:'GET'|'POST'='GET',organizationOverride=organizationId){
  if(!organizationOverride)throw new Error('Workspace não encontrado.');
  const response=await fetch(`/api/whatsapp/${action}?organizationId=${encodeURIComponent(organizationOverride)}`,{method,headers:{'Content-Type':'application/json'},cache:'no-store'});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error??'Não foi possível concluir a operação.');
  return payload;
 }
 async function connect(){
  setBusy(true);setError('');setNotice('');setQr(null);setQrTimedOut(false);qrStartedAt.current=Date.now();
  try{
   // Always ask the backend to create/restart the same stable D-API session.
   // The provider may have lost a session while its ID remains stored locally.
   // D-API explicitly supports POST /sessions as an idempotent create/restart
   // operation for the same sessionId, so do not skip it when the ID exists.
   await requestApi('connect','POST');
   await load();
   const payload=await requestApi('qr');
   if(payload.status==='connected'){
    setQrPolling(false);
    qrStartedAt.current=null;
    setNotice('WhatsApp conectado com sucesso.');
    await load();
   }else{
    applyQrPayload(payload);
    qrStartedAt.current=Date.now();
    setQrPolling(true);
    setNotice('Aguardando QR Code da D-API. O Tendi continuará consultando automaticamente.');
   }
  }catch(e){setError(e instanceof Error?e.message:'Falha ao iniciar a conexão com a D-API.');}
  finally{setBusy(false);}
 }
 async function refreshQr(){
  setBusy(true);setError('');
  try{
   const payload=await requestApi('qr');
   if(payload.status==='connected'){
    setQr(null);setQrPolling(false);qrStartedAt.current=null;setNotice('WhatsApp conectado com sucesso.');await load();
   }else{
    applyQrPayload(payload);
    if(qrStartedAt.current===null)qrStartedAt.current=Date.now();
    setQrPolling(true);
    setQrTimedOut(false);
   }
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o QR Code.');}
  finally{setBusy(false);}
 }
 async function generateNewQr(){
  setBusy(true);setError('');setNotice('');setQr(null);setQrTimedOut(false);
  try{
   // POST /sessions reuses the saved provider_account_id as the stable sessionId.
   await requestApi('connect','POST');
   await load();
   qrStartedAt.current=Date.now();
   setQrPolling(true);
   setNotice('Nova tentativa iniciada. Aguardando o QR Code da D-API.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível reiniciar a sessão.');}
  finally{setBusy(false);}
 }
 // Prompt-compliant polling: query our backend every 3 seconds even when
 // the provider returns the expected initial 404 (no QR available yet).
 useEffect(()=>{
  if(!qrPolling||!organizationId)return;
  let active=true;
  let inFlight=false;
  if(qrStartedAt.current===null)qrStartedAt.current=Date.now();
  const timeout=window.setTimeout(()=>{
   if(!active)return;
   setQrPolling(false);
   setQrTimedOut(true);
   setNotice('O QR Code não foi conectado em 2 minutos. Gere um novo QR Code para tentar novamente.');
  },120_000);
  const poll=async()=>{
   if(!active||inFlight)return;
   inFlight=true;
   try{
    const payload=await requestApi('qr');
    if(!active)return;
    if(payload.status==='connected'){
     setQr(null);
     setQrPolling(false);
     qrStartedAt.current=null;
     setQrTimedOut(false);
     setNotice('WhatsApp conectado com sucesso.');
     await load();
     return;
    }
    if(payload.status==='disconnected'||payload.status==='error'){
     setQr(null);
     setQrPolling(false);
     qrStartedAt.current=null;
     setNotice('WhatsApp desconectado. Gere um novo QR Code para reconectar.');
     await load();
     return;
    }
    applyQrPayload(payload);
    if(Date.now()-(qrStartedAt.current??Date.now())>=120_000){
     setQrPolling(false);
     setQrTimedOut(true);
     setNotice('O QR Code não foi conectado em 2 minutos. Gere um novo QR Code para tentar novamente.');
    }
   }catch(e){
    if(active)setError(e instanceof Error?e.message:'Falha ao consultar o QR Code da D-API.');
   }finally{inFlight=false;}
  };
  void poll();
  const timer=window.setInterval(()=>{void poll();},3000);
  return ()=>{active=false;window.clearInterval(timer);window.clearTimeout(timeout);};
 },[qrPolling,organizationId]);

 async function disconnect(){
  if(!window.confirm('Deseja realmente desconectar este WhatsApp?'))return;
  setBusy(true);setError('');
  try{await requestApi('disconnect','POST');setQr(null);setNotice('WhatsApp desconectado.');await load();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível desconectar.');}
  finally{setBusy(false);}
 }
 const whatsapp=rows.find(r=>r.channel==='whatsapp');
 const connected=whatsapp?.status==='connected';
 const { role } = useWorkspaceRole(organizationId);
 const canManageChannels = role==='owner'||role==='admin';
 return <WorkspaceShell title="Canais e automações" description="Conecte seus canais e organize os atendimentos do workspace">
  <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#25275B] via-[#2F316B] to-[#004751] p-6 text-white shadow-sm md:p-8">
   <div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/80"><Bot size={13}/> Central de canais Tendi</span><h1 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">Seu atendimento, em um só lugar.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Conecte os canais da sua empresa para receber e responder mensagens pela equipe, com histórico centralizado no Inbox.</p></div><div className="rounded-2xl border border-white/15 bg-white/10 p-4"><MessageCircle size={30}/><p className="mt-3 text-[10px] font-semibold text-white/70">{workspace||'Workspace ativo'}</p></div></div>
  </section>
  {error&&<p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
  {notice&&<p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}
  {loading?<div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-[#2F316B"/></div>:<>
   <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-4"><span className="rounded-2xl bg-[#E8F6EF] p-4 text-[#16834C]"><MessageCircle size={27}/></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-[#25275B]">WhatsApp</h2><span className={connected?'rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700':'rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700'}>{statusLabel(whatsapp?.status??'disconnected')}</span></div><p className="mt-1 text-xs text-slate-500">Conecte seu WhatsApp pelo QR Code, sem compartilhar códigos ou chaves com a equipe Tendi.</p><p className="mt-2 text-xs font-semibold text-slate-700">{whatsapp?.display_name??'Nenhum número conectado'}</p></div></div>
     <div className="flex flex-wrap gap-2">{connected?<button onClick={disconnect} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Unplug size={15}/>Desconectar</button>:<button onClick={connect} disabled={busy||!organizationId} className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-xs font-semibold text-white transition hover:bg-[#003B44] disabled:opacity-50">{busy?<Loader2 size={15} className="animate-spin"/>:<QrCode size={15}/>} {whatsapp?.status==='pending'?'Continuar conexão':'Conectar com QR Code'}<ArrowRight size={14}/></button>}</div>
    </div>
    {(qr?.qrCodeImage||qrPolling||qrTimedOut)&&<div className="mt-6 grid gap-5 rounded-2xl border border-slate-200 bg-[#F8FAFC] p-5 md:grid-cols-[190px_1fr] md:items-center"><div className="mx-auto grid size-[190px] place-items-center rounded-2xl border border-slate-200 bg-white p-3">{qr?.qrCodeImage?<img src={qr.qrCodeImage} alt="QR Code para conectar o WhatsApp" className="size-44 object-contain"/>:qr?.qrCode?<QRCodeSVG value={qr.qrCode} size={176} level="M" marginSize={2} aria-label="QR Code para conectar o WhatsApp"/>:<div className="text-center text-xs text-slate-500">{qrTimedOut?'Tempo de conexão esgotado':qr?.waiting?'Gerando QR Code…':'Aguardando QR Code da D-API…'}</div>}</div><div><div className="flex items-center gap-2 text-sm font-bold text-[#25275B]"><QrCode size={17}/>Leia o QR Code no WhatsApp</div><ol className="mt-3 list-inside list-decimal space-y-2 text-xs leading-5 text-slate-600"><li>Abra o WhatsApp no celular que deseja conectar.</li><li>Acesse <strong>Dispositivos conectados</strong> e toque em <strong>Conectar dispositivo</strong>.</li><li>Escaneie o QR Code exibido nesta tela.</li></ol><div className="mt-4 flex flex-wrap items-center gap-2"><button onClick={refreshQr} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#004751] ring-1 ring-slate-200 disabled:opacity-50"><RefreshCw size={14}/>Atualizar QR / status</button><span className="text-[10px] text-slate-400">QR Code temporário. Atualização automática a cada 3 segundos.</span>{!qr?.waiting&&qr?.diagnostic&&!qr.diagnostic.qrCodePresent&&!qr.diagnostic.qrCodeImagePresent&&<span className="w-full text-[10px] text-amber-700">A D-API respondeu sem os campos do QR. Campos recebidos: {(qr.diagnostic.resourceKeys??qr.diagnostic.responseKeys??[]).join(', ')||'nenhum informado'}.{qr.diagnostic.providerError&&<> Motivo informado pela D-API: {qr.diagnostic.providerError}.</>}{qr.diagnostic.providerCode&&<> Código: {qr.diagnostic.providerCode}.</>}</span>}{qrTimedOut&&<button onClick={generateNewQr} disabled={busy} className="rounded-lg bg-[#004751] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Gerar novo QR Code</button>}</div></div></div>}
    {connected&&<div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800"><CheckCircle2 size={16}/>Sessão confirmada pela D-API.</div>}
    <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-3"><Step number="01" title="Inicie a conexão" detail="O Tendi cria uma sessão exclusiva para este workspace."/><Step number="02" title="Leia o QR Code" detail="Autorize o acesso pelo menu Dispositivos conectados do WhatsApp."/><Step number="03" title="Confirme o status" detail="O Tendi consulta a sessão diretamente na D-API." /></div>
   </section>
   <div className="mb-3"><h2 className="text-sm font-bold text-[#25275B]">Outros canais</h2><p className="mt-1 text-xs text-slate-400">Expanda sua operação para novos pontos de contato.</p></div>
   <div className="mb-6">{organizationId&&<WebchatSettingsCard organizationId={organizationId} canManage={canManageChannels}/>}</div>
   <div>{organizationId&&<MetaConnectionCard organizationId={organizationId} connections={rows.filter(r=>r.channel==='instagram'||r.channel==='messenger')} canManage={canManageChannels} onChanged={load}/>}</div>
   <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"><ShieldCheck className="mt-0.5 shrink-0 text-[#004751]" size={18}/><p className="text-[11px] leading-5 text-slate-500">A chave da D-API fica exclusivamente no servidor. Cada workspace possui uma sessão independente e só pode consultar ou desconectar a própria conexão. A integração de recebimento de mensagens no Inbox depende da homologação dos eventos de webhook.</p></div>
  </>}
 </WorkspaceShell>;
}
function Step({number,title,detail}:{number:string;title:string;detail:string}){return <div className="flex gap-3 rounded-xl bg-[#F7F8FC] p-3"><span className="text-xs font-bold text-[#CB0A9F]">{number}</span><div><p className="text-xs font-semibold text-[#2F316B]">{title}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{detail}</p></div></div>}
