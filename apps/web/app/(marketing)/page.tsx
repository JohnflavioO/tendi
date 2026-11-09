import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, Bot, Check, CheckCircle2, CircleHelp,
  MessageSquareText, Users, Workflow, ReceiptText, Building2,
  Clock3, MessagesSquare, ChartNoAxesCombined, Sparkles, ShieldCheck,
} from 'lucide-react';
import { siteContent, features, steps, faqs } from '@/content/marketing/site';
import { plans, comparison } from '@/content/marketing/plans';
import { ProductPreview } from '@/components/marketing/product-preview';

const featureIcons = [MessageSquareText, Workflow, Bot, Users, ReceiptText, Building2];
const outcomes = [
  { icon: MessagesSquare, title: 'Conversas no lugar certo', description: 'Dê contexto ao atendimento e evite que informações importantes fiquem espalhadas.' },
  { icon: Clock3, title: 'Próximos passos mais claros', description: 'Saiba o que está aguardando resposta e quem precisa continuar cada conversa.' },
  { icon: ChartNoAxesCombined, title: 'Oportunidades acompanhadas', description: 'Conecte o relacionamento com a rotina comercial e acompanhe cada etapa.' },
];

function PipelinePreview() {
  const stages = [
    { label: 'Novo contato', count: '12', width: 'w-[78%]' },
    { label: 'Em atendimento', count: '08', width: 'w-[58%]' },
    { label: 'Proposta enviada', count: '05', width: 'w-[38%]' },
  ];
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(32,39,91,.10)] sm:p-7">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-5">
        <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#CB0A9F]">Visão comercial</p><h3 className="mt-1 text-lg font-bold text-[#25275B]">Pipeline de oportunidades</h3></div>
        <span className="rounded-lg bg-[#F2F8F7] px-3 py-2 text-xs font-semibold text-[#004751]">Esta semana</span>
      </div>
      <div className="mt-6 space-y-5">
        {stages.map((stage) => (
          <div key={stage.label}>
            <div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">{stage.label}</span><span className="font-bold tabular-nums text-[#25275B]">{stage.count}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full bg-[#004751] ${stage.width}`} /></div>
          </div>
        ))}
      </div>
      <div className="mt-7 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-[#F7F8FC] p-4"><p className="text-[10px] font-semibold text-slate-500">Em acompanhamento</p><p className="mt-1 text-2xl font-extrabold text-[#25275B]">25</p></div>
        <div className="rounded-xl bg-[#F7F8FC] p-4"><p className="text-[10px] font-semibold text-slate-500">Etapas organizadas</p><p className="mt-1 text-2xl font-extrabold text-[#25275B]">03</p></div>
      </div>
      <p className="mt-4 text-[10px] text-slate-400">Exemplo visual ilustrativo, sem dados de clientes.</p>
    </div>
  );
}

export default function MarketingHome() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-[#F7F8FC]">
        <div className="pointer-events-none absolute -right-48 -top-24 -z-10 size-[620px] rounded-full bg-[#CB0A9F]/[.08] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-40 -z-10 size-[440px] rounded-full bg-[#004751]/[.07] blur-3xl" />
        <div className="mx-auto grid min-h-[690px] max-w-[1200px] items-center gap-14 px-5 pb-20 pt-24 md:grid-cols-2 md:px-6 md:pb-24 md:pt-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#CB0A9F]/15 bg-white/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#CB0A9F]"><Sparkles size={13} /> Atendimento e gestão conectados</p>
            <h1 className="mt-6 max-w-xl text-[clamp(2.45rem,5vw,4.1rem)] font-extrabold leading-[1.04] tracking-[-.05em] text-[#25275B]">{siteContent.heroTitle}</h1>
            <p className="mt-6 max-w-[38rem] text-lg leading-8 text-slate-600">{siteContent.heroDescription}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#004751] px-6 text-sm font-bold text-white shadow-lg shadow-[#004751]/15 transition hover:-translate-y-0.5 hover:bg-[#003943]">{siteContent.primaryCta}<ArrowRight size={17} /></Link>
              <a href="#como-funciona" className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-[#2F316B] transition hover:border-[#004751]">Veja como funciona<ArrowUpRight size={16} /></a>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2"><Check size={14} className="text-emerald-600" />14 dias para testar</span>
              <span className="inline-flex items-center gap-2"><Check size={14} className="text-emerald-600" />Sem cartão no cadastro</span>
              <span className="inline-flex items-center gap-2"><Check size={14} className="text-emerald-600" />IA nos dois planos</span>
            </div>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section aria-label="Benefícios do Tendi" className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-8 md:grid-cols-3 md:px-6">
          {outcomes.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#CB0A9F]/[.08] text-[#CB0A9F]"><Icon size={20} /></span>
              <div><h2 className="text-sm font-bold text-[#25275B]">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="recursos" className="scroll-mt-24 bg-white py-20 md:py-24">
        <div className="mx-auto max-w-[1200px] px-5 md:px-6">
          <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#CB0A9F]">Uma operação mais conectada</p><h2 className="mt-4 text-3xl font-bold tracking-tight text-[#25275B] md:text-4xl">Tudo começa com uma conversa. O Tendi ajuda sua equipe a dar continuidade.</h2><p className="mt-4 text-base leading-7 text-slate-600">Atendimento, relacionamento e gestão comercial trabalhando juntos para sua empresa não perder o fio de cada oportunidade.</p></div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = featureIcons[index];
              return <article key={feature.id} className={`group rounded-2xl border p-6 transition duration-200 hover:-translate-y-1 hover:shadow-xl ${index === 0 ? 'border-[#004751]/25 bg-[#F2F8F7] md:col-span-2 lg:col-span-2' : 'border-slate-200 bg-white hover:border-[#004751]/25'}`}>
                <span className="flex size-11 items-center justify-center rounded-xl bg-[#2F316B]/[.07] text-[#004751] transition group-hover:bg-[#004751] group-hover:text-white"><Icon size={21} /></span>
                <p className="mt-5 text-[10px] font-bold tracking-[.18em] text-[#CB0A9F]">{feature.eyebrow}</p><h3 className="mt-2 text-xl font-bold text-[#25275B]">{feature.title}</h3><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">{feature.description}</p><p className="mt-4 border-t border-slate-200/80 pt-4 text-xs font-medium text-slate-500">{feature.detail}</p>
              </article>;
            })}
          </div>
          <div className="mt-9 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#F7F8FC] p-6"><p className="font-semibold text-[#25275B]">Veja como o Tendi pode se encaixar na sua operação.</p><Link href="/register" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#004751] px-5 text-sm font-bold text-white transition hover:bg-[#003943]">Experimentar por 14 dias<ArrowRight size={16} /></Link></div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-24 bg-[#F7F8FC] py-20 md:py-24">
        <div className="mx-auto max-w-[1200px] px-5 md:px-6">
          <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#CB0A9F]">Simples de começar</p><h2 className="mt-4 text-3xl font-bold text-[#25275B] md:text-4xl">Organize primeiro. Evolua com sua equipe.</h2><p className="mt-4 text-base leading-7 text-slate-600">Um caminho claro para estruturar o atendimento e acompanhar o relacionamento com seus clientes.</p></div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">{steps.map((step) => <article key={step.number} className="relative rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><span className="text-sm font-extrabold tracking-wider text-[#CB0A9F]">{step.number}</span><h3 className="mt-5 text-xl font-bold text-[#25275B]">{step.title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{step.description}</p></article>)}</div>
        </div>
      </section>

      <section className="bg-white py-20 md:py-24">
        <div className="mx-auto max-w-[1200px] space-y-20 px-5 md:px-6">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#CB0A9F]">Atendimento com contexto</p><h2 className="mt-4 text-3xl font-bold leading-tight text-[#25275B] md:text-4xl">Uma conversa não deveria depender da memória de alguém.</h2><p className="mt-5 text-base leading-7 text-slate-600">Com uma visão compartilhada, sua equipe consegue entender o histórico, identificar responsáveis e seguir com o atendimento com mais consistência.</p><ul className="mt-6 space-y-3 text-sm text-slate-600"><li className="flex gap-2"><CheckCircle2 size={17} className="shrink-0 text-emerald-600" />Conversas centralizadas e contextualizadas</li><li className="flex gap-2"><CheckCircle2 size={17} className="shrink-0 text-emerald-600" />Distribuição e acompanhamento por equipe</li><li className="flex gap-2"><CheckCircle2 size={17} className="shrink-0 text-emerald-600" />Apoio de inteligência artificial</li></ul><Link href="/register" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#004751]">Começar teste grátis<ArrowRight size={16} /></Link></div>
            <div className="rounded-[2rem] bg-[#F7F8FC] p-4 sm:p-7"><ProductPreview /></div>
          </div>
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div className="order-2 rounded-[2rem] bg-[#F7F8FC] p-4 sm:p-7 md:order-1"><PipelinePreview /></div>
            <div className="order-1 md:order-2"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#CB0A9F]">Gestão comercial</p><h2 className="mt-4 text-3xl font-bold leading-tight text-[#25275B] md:text-4xl">O relacionamento continua depois da primeira resposta.</h2><p className="mt-5 text-base leading-7 text-slate-600">Acompanhe oportunidades por etapa, organize prioridades e ajude o time a saber qual é o próximo passo de cada negociação.</p><div className="mt-6 flex items-start gap-3 rounded-xl border border-[#004751]/15 bg-[#F2F8F7] p-4"><Workflow size={20} className="mt-0.5 shrink-0 text-[#004751]" /><p className="text-sm leading-6 text-slate-600">Atendimento e CRM conectados para dar continuidade ao relacionamento com seus contatos.</p></div></div>
          </div>
        </div>
      </section>

      <section id="planos" className="scroll-mt-24 bg-[#F7F8FC] py-20 md:py-24">
        <div className="mx-auto max-w-[1200px] px-5 md:px-6">
          <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#CB0A9F]">Planos Tendi</p><h2 className="mt-4 text-3xl font-bold text-[#25275B] md:text-4xl">O espaço certo para sua equipe crescer.</h2><p className="mt-4 text-base leading-7 text-slate-600">Comece com 14 dias de teste gratuito, sem cartão no cadastro. Escolha a estrutura que acompanha o momento da sua operação.</p></div>
          <div className="mx-auto mt-12 grid max-w-4xl items-stretch gap-5 md:grid-cols-2">
            {plans.map((plan) => <article key={plan.code} className={`relative flex flex-col overflow-hidden rounded-3xl bg-white ${plan.featured ? 'border-2 border-[#004751] shadow-xl shadow-[#004751]/10' : 'border border-slate-200 shadow-sm'}`}>
              {plan.featured && <div className="bg-[#004751] px-6 py-2 text-center text-xs font-bold uppercase tracking-wider text-white">Para uma operação em expansão</div>}
              <div className="flex flex-1 flex-col p-7 md:p-8">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#CB0A9F]">{plan.label}</p><h3 className="mt-3 text-2xl font-extrabold text-[#25275B]">{plan.name}</h3><p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">{plan.description}</p>
                <div className="mt-6 rounded-2xl bg-[#F7F8FC] p-5"><p className="text-lg font-extrabold text-[#25275B]">14 dias para experimentar</p><p className="mt-1 text-xs text-slate-500">Sem cartão no cadastro e sem cobrança durante o teste.</p></div>
                <div className="mt-6 space-y-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">O que está incluído</p>{plan.features.map((feature) => <div key={feature} className="flex items-start gap-3 text-sm text-slate-700"><Check size={17} className="mt-0.5 shrink-0 text-emerald-600" />{feature}</div>)}</div>
                <Link href={plan.href} className={`mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition ${plan.featured ? 'bg-[#004751] text-white hover:bg-[#003943]' : 'border border-[#004751] text-[#004751] hover:bg-[#004751]/5'}`}>{plan.cta}<ArrowRight size={16} /></Link>
              </div>
            </article>)}
          </div>
          <div className="mx-auto mt-7 flex max-w-3xl items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#004751]" /><p className="text-xs leading-5 text-slate-500">Valores de contratação e eventuais custos de provedores externos serão apresentados antes da contratação. Integrações adicionais dependem de escopo, disponibilidade técnica e configuração.</p></div>
          <details className="mx-auto mt-8 max-w-4xl rounded-2xl border border-slate-200 bg-white"><summary className="cursor-pointer px-6 py-5 text-sm font-bold text-[#25275B]">Comparar os recursos dos planos</summary><div className="overflow-x-auto px-4 pb-5"><table className="w-full min-w-[560px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200"><th className="sticky left-0 bg-white px-3 py-3 text-slate-500">Recurso</th><th className="px-3 py-3 text-[#25275B]">Tendi Start</th><th className="px-3 py-3 text-[#004751]">Tendi Pro</th></tr></thead><tbody>{comparison.map((row) => <tr key={row.feature} className="border-b border-slate-100"><th className="sticky left-0 bg-white px-3 py-3 font-medium text-slate-600">{row.feature}</th><td className="px-3 py-3 text-slate-600">{row.start}</td><td className="px-3 py-3 text-slate-600">{row.pro}</td></tr>)}</tbody></table></div></details>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 bg-white py-20 md:py-24">
        <div className="mx-auto max-w-[850px] px-5 md:px-6"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#CB0A9F]">Dúvidas frequentes</p><h2 className="mt-4 text-3xl font-bold text-[#25275B] md:text-4xl">Tudo claro antes de começar.</h2><div className="mt-8 divide-y divide-slate-200">{faqs.map((faq) => <details key={faq.question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-[#25275B]">{faq.question}<CircleHelp size={18} className="shrink-0 text-[#CB0A9F]" /></summary><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{faq.answer}</p></details>)}</div></div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#2F316B] py-16 text-white md:py-20">
        <div className="pointer-events-none absolute -right-24 -top-32 -z-10 size-96 rounded-full bg-[#CB0A9F]/20 blur-3xl" />
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 px-5 md:flex-row md:items-center md:px-6"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#F4A8DF]">Seu próximo passo</p><h2 className="mt-4 max-w-2xl text-3xl font-bold md:text-4xl">Menos informação espalhada. Mais clareza para sua equipe avançar.</h2><p className="mt-4 text-sm text-white/70">Experimente o Tendi por 14 dias, sem cadastrar cartão.</p></div><Link href="/register" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-[#2F316B] transition hover:-translate-y-0.5 hover:bg-slate-100">Começar teste grátis<ArrowRight size={17} /></Link></div>
      </section>
    </>
  );
}
