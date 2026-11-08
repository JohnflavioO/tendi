import { Bot, CheckCheck, Headphones, MoreHorizontal, Search, Send, UserRound } from 'lucide-react';

export function ProductPreview() {
  return <div aria-label="Prévia ilustrativa da interface Tendi" className="relative mx-auto w-full max-w-[570px]">
    <div className="absolute -inset-5 rounded-[2rem] bg-[#CB0A9F]/[.06] blur-2xl" />
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(32,39,91,.14)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500"/><span className="text-sm font-bold text-[#25275B]">Central de atendimento</span></div><MoreHorizontal className="text-slate-400" size={20}/></div>
      <div className="grid min-h-[340px] grid-cols-[.9fr_1.1fr]">
        <aside className="border-r border-slate-100 bg-slate-50/70 p-3">
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-400"><Search size={13}/> Buscar conversa</div>
          {['Mariana Costa','Rafael Mendes','Camila Oliveira'].map((name,index)=><div key={name} className={`mb-2 rounded-xl p-3 ${index===0?'bg-[#004751]/[.07]':'bg-transparent'}`}><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-full bg-[#2F316B]/10 text-[10px] font-bold text-[#2F316B]">{name.split(' ').map(n=>n[0]).join('')}</span><span className="truncate text-[11px] font-semibold text-slate-700">{name}</span></div><p className="mt-2 truncate text-[10px] text-slate-400">{['Pode me enviar a proposta?','Obrigado pelo retorno!','Gostaria de saber mais'][index]}</p></div>)}
        </aside>
        <section className="flex flex-col p-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3"><span className="flex size-8 items-center justify-center rounded-full bg-[#CB0A9F]/10 text-[#CB0A9F]"><UserRound size={15}/></span><div><p className="text-xs font-bold text-[#25275B]">Mariana Costa</p><p className="text-[10px] text-emerald-600">Em atendimento</p></div></div>
          <div className="flex-1 space-y-3 py-5"><div className="max-w-[90%] rounded-xl rounded-tl-sm bg-slate-100 p-3 text-[11px] leading-5 text-slate-600">Olá! Gostaria de receber uma proposta para minha empresa.</div><div className="ml-auto max-w-[90%] rounded-xl rounded-tr-sm bg-[#004751] p-3 text-[11px] leading-5 text-white">Claro, Mariana. Vou organizar as informações para você.</div><div className="flex items-center gap-2 text-[10px] text-slate-400"><Bot size={13}/> Sugestão de resposta disponível <CheckCheck size={12}/></div></div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-[11px] text-slate-400"><span>Escreva sua mensagem...</span><Send size={14} className="text-[#004751]"/></div>
        </section>
      </div>
    </div>
    <div className="absolute -bottom-6 -right-3 hidden rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:block"><div className="flex items-center gap-2 text-xs font-semibold text-[#25275B]"><Headphones size={15} className="text-[#CB0A9F]"/> Oportunidade acompanhada</div><p className="mt-2 text-[11px] text-slate-500">Proposta em negociação</p><div className="mt-3 h-1.5 w-36 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/3 rounded-full bg-[#004751]"/></div></div>
  </div>;
}
