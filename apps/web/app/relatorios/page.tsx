'use client';

import { useEffect, useState } from 'react';
import { ChartNoAxesCombined, MessageCircle, Users, Target, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { requestedOrganizationId, resolveCurrentOrganization } from '@/lib/current-organization';
import { WorkspaceShell } from '@/components/workspace-shell';
import { Card, Metric } from '@/components/ui';

export default function ReportsPage(){
 const supabase=createClient() as any;const [stats,setStats]=useState({contacts:0,conversations:0,open:0,closed:0,opportunities:0,won:0,value:0});const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 useEffect(()=>{async function load(){const {data:u}=await supabase.auth.getUser();if(!u.user)return;const {organization:org}=await resolveCurrentOrganization<{id:string}>(supabase,u.user.id,'id',requestedOrganizationId());if(!org)return;const id=org.id;const [c,cv,o]=await Promise.all([supabase.from('contacts').select('id',{count:'exact',head:true}).eq('organization_id',id),supabase.from('conversations').select('id,status',{count:'exact'}).eq('organization_id',id),supabase.from('opportunities').select('id,amount,stage_id,crm_stages(final_type)').eq('organization_id',id)]);if(c.error)throw c.error;if(cv.error)throw cv.error;if(o.error)throw o.error;const deals=o.data??[];setStats({contacts:c.count??0,conversations:cv.count??0,open:(cv.data??[]).filter((x:any)=>x.status==='open').length,closed:(cv.data??[]).filter((x:any)=>x.status==='closed').length,opportunities:deals.length,won:deals.filter((x:any)=>x.crm_stages?.final_type==='won').length,value:deals.reduce((a:number,x:any)=>a+Number(x.amount||0),0)});setLoading(false);}void load().catch(e=>{setError(e.message);setLoading(false)});},[]);
 const conversion=stats.opportunities?Math.round(stats.won/stats.opportunities*100):0;
 const handled=stats.open+stats.closed;
 const openShare=handled?Math.round(stats.open/handled*100):0;
 return <WorkspaceShell title="Relatórios" description="Indicadores consolidados do seu workspace">
 {error&&<p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700 ring-1 ring-inset ring-rose-600/10">{error}</p>}
 {loading?<div className="grid h-48 place-items-center"><Loader2 className="animate-spin text-tendi-indigo"/></div>:<>
 <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
  <Metric label="Contatos" value={stats.contacts} icon={Users} hint="Base cadastrada"/>
  <Metric label="Conversas" value={stats.conversations} icon={MessageCircle} tone="teal" hint="Todos os canais"/>
  <Metric label="Abertas agora" value={stats.open} icon={Clock3} tone="magenta" hint="Aguardando a equipe"/>
  <Metric label="Oportunidades" value={stats.opportunities} icon={Target} hint="No funil de vendas"/>
  <Metric label="Vendas ganhas" value={stats.won} icon={CheckCircle2} tone="teal" hint={`${conversion}% de conversão`} className="col-span-2 md:col-span-1"/>
 </div>
 <div className="mt-6 grid gap-4 lg:grid-cols-2">
  <Card title="Pipeline comercial" description="Valor total das oportunidades cadastradas" icon={ChartNoAxesCombined} tone="teal">
   <p className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-tendi-teal">{stats.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
   <div className="mt-6 flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">Taxa de conversão</span><span className="font-semibold tabular-nums text-tendi-navy">{conversion}%</span></div>
   <div className="mt-2 h-2 overflow-hidden rounded-full bg-tendi-haze ring-1 ring-inset ring-tendi-line/70"><div className="h-full rounded-full bg-gradient-to-r from-tendi-teal to-[#0A7F8C] transition-all duration-700" style={{width:conversion+'%'}}/></div>
   <p className="mt-2 text-[11px] text-slate-400">{stats.won} de {stats.opportunities} oportunidades ganhas</p>
  </Card>
  <Card title="Atendimento" description="Distribuição atual das conversas" icon={MessageCircle} tone="magenta">
   <div className="grid grid-cols-2 gap-3">
    <div className="td-subtle p-4"><p className="td-eyebrow">Abertas</p><p className="mt-2 text-[28px] font-semibold leading-none tabular-nums text-tendi-magenta">{stats.open}</p></div>
    <div className="td-subtle p-4"><p className="td-eyebrow">Encerradas</p><p className="mt-2 text-[28px] font-semibold leading-none tabular-nums text-tendi-teal">{stats.closed}</p></div>
   </div>
   <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-tendi-haze ring-1 ring-inset ring-tendi-line/70">{handled>0&&<><div className="h-full bg-tendi-magenta" style={{width:openShare+'%'}}/><div className="h-full bg-tendi-teal" style={{width:(100-openShare)+'%'}}/></>}</div>
   <p className="mt-2 text-[11px] text-slate-400">{handled?`${openShare}% das conversas ainda abertas`:'Sem conversas registradas ainda'}</p>
  </Card>
 </div></>}
 </WorkspaceShell>;
}
