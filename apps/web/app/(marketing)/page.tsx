import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, CheckCircle2, ChevronDown, ReceiptText, Workflow,
} from 'lucide-react';
import { siteContent, features, steps, getFaqs } from '@/content/marketing/site';
import { getTrialDays } from '@/lib/trial-days';
import { trialDaysLabel } from '@/lib/trial';
import { Pricing } from '@/components/marketing/pricing';
import { getPublicPlans } from '@/lib/public-plans';
import { ProductPreview } from '@/components/marketing/product-preview';
import { Reveal } from '@/components/marketing/reveal';
import { ChannelBadge } from '@/components/inbox/channel-badge';
import { CHANNEL_ORDER, CHANNEL_INFO } from '@/lib/channels';

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

/**
 * Vitrine da 2ª via de boleto (plano Pro): a conversa acontece (pedido do cliente, "digitando…"
 * e a confirmação) e o boleto chega como resultado — tudo com uma entrada encadeada em CSS
 * (.animate-fade-up com atraso crescente + os pontinhos de "digitando" em app/globals.css).
 * Toca uma vez ao carregar a seção, sem JS nem scroll listener, pra não pesar a landing.
 */
function BoletoAutomationPreview() {
  const providers = ['Asaas', 'Pagar.me', 'Vindi'];
  return (
    <div className="relative mx-auto w-full max-w-[480px]">
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(32,39,91,.12)] sm:p-7">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Cobrança automática</p><h3 className="mt-1 text-lg font-bold text-[#25275B]">2ª via de boleto</h3></div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#004751]/[.08] text-[#004751]"><ReceiptText size={18} /></span>
        </div>

        <div className="mt-5 space-y-2">
          <p className="animate-fade-up ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-sm bg-[#F5F6FB] px-3.5 py-2.5 text-xs leading-5 text-slate-600">Oi, preciso da 2ª via do meu boleto</p>
          <div className="td-typing-wrap flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-sm bg-[#004751] px-3.5 py-3 text-white" style={{ animationDelay: '.55s' }}>
            <span className="td-typing-dot" /><span className="td-typing-dot" /><span className="td-typing-dot" />
          </div>
          <p className="animate-fade-up max-w-[85%] rounded-2xl rounded-bl-sm bg-[#004751] px-3.5 py-2.5 text-xs leading-5 text-white" style={{ animationDelay: '1.35s' }}>Encontrei! Segue a linha digitável e o PDF do seu boleto.</p>
        </div>

        <div className="animate-fade-up mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-[#FAFBFD]" style={{ animationDelay: '1.7s' }}>
          <div className="h-1 w-full bg-gradient-to-r from-[#004751] to-[#2F316B]" />
          <div className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Valor</p><p className="mt-1 text-2xl font-extrabold text-[#25275B]">R$ 189,00</p></div>
              <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">Vence em 20/11</span>
            </div>
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Linha digitável</p>
              <p className="mt-1 truncate font-mono text-[11px] text-slate-600">23793.38128 60000.000003 00000.000400 1 84340000018900</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="text-[10px] font-semibold text-slate-400">Conecta com</span>
          {providers.map(provider => <span key={provider} className="rounded-full bg-[#F7F8FC] px-2.5 py-1 text-[10px] font-semibold text-[#2F316B]">{provider}</span>)}
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] text-slate-400">Exemplo visual ilustrativo, sem dados de clientes.</p>
    </div>
  );
}

// O prazo do teste vem do banco; revalida a página para refletir mudanças feitas no console admin.
export const revalidate = 300;

export default async function MarketingHome() {
  const [trialDays, plans] = await Promise.all([getTrialDays(), getPublicPlans()]);
  const trialLabel = trialDaysLabel(trialDays);
  const faqs = getFaqs(trialLabel, plans);
  const startPrice = plans.map(plan => plan.annualPrice ? Math.min(plan.monthlyPrice ?? Infinity, plan.annualPrice / 12) : plan.monthlyPrice ?? Infinity).reduce((a, b) => Math.min(a, b), Infinity);
  return (
    <>
      <section className="bg-[#25275B] text-white" aria-labelledby="landing-title">
        <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:py-24">
          <div>
            <p className="mb-5 text-sm font-semibold text-[#E9B9E0]">Atendimento e CRM</p>
            <h1 id="landing-title" className="max-w-[11ch] text-[clamp(2.65rem,6.1vw,5.25rem)] font-bold leading-[1.02] tracking-[-.055em]">
              Quem ficou <span className="text-[#E9B9E0]">de responder?</span>
            </h1>
            <p className="mt-7 max-w-md text-base leading-7 text-white/85">
              Veja quem assumiu cada conversa, o que já foi combinado e quando é hora de retomar.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/register" className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[#E9B9E0] px-5 text-sm font-bold text-[#25275B] transition hover:bg-white">
                {siteContent.primaryCta}<ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a href="#como-funciona" className="py-2 text-sm font-semibold underline decoration-white/50 underline-offset-4 hover:decoration-white">
                Veja como funciona
              </a>
            </div>
            <p className="mt-5 text-sm text-white/70">
              {trialLabel} grátis · sem cartão · a partir de {Number.isFinite(startPrice) ? startPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : 'R$ 160'}/mês
            </p>
          </div>

          <figure className="relative mx-auto w-full max-w-[32rem] pb-8 pr-6 sm:pb-10 sm:pr-8">
            <div className="overflow-hidden rounded-2xl">
              <Image
                src="/brand/landing-atendimento.webp"
                alt=""
                width={960}
                height={720}
                priority
                sizes="(min-width: 1024px) 32rem, 100vw"
                className="aspect-[4/3] w-full object-cover object-[62%_center]"
              />
            </div>
            <figcaption className="absolute -bottom-6 -right-3 w-60 rounded-xl border border-slate-200 bg-white p-4 text-left text-[#25275B] shadow-[0_24px_60px_rgba(16,19,56,.35)] sm:-bottom-8 sm:-right-6 sm:w-64">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Exemplo de atendimento</p>
              <p className="mt-1.5 text-sm font-bold leading-snug">&quot;Pode me mandar a proposta?&quot;</p>
              <dl className="mt-3 space-y-1 text-[11px] text-slate-500">
                <div className="flex gap-1"><dt className="font-semibold text-slate-700">Responsável:</dt><dd>Ana · Comercial</dd></div>
                <div className="flex gap-1"><dt className="font-semibold text-slate-700">Próximo passo:</dt><dd>Enviar proposta amanhã</dd></div>
              </dl>
            </figcaption>
          </figure>
        </div>
      </section>

      <div className="border-b border-[#DADBCF] bg-[#F8F7F1]">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-5 sm:px-8">
          <span className="w-full text-sm font-semibold text-[#25275B] sm:w-auto">Canais de atendimento</span>
          {CHANNEL_ORDER.map(key => (
            <span key={key} className="flex items-center gap-2 text-sm text-slate-700">
              <ChannelBadge channel={key} className="size-6" />{CHANNEL_INFO[key].label}
            </span>
          ))}
        </div>
      </div>

      <section id="recursos" className="scroll-mt-24 bg-[#F8F7F1] py-16 md:py-24">
        <div className="mx-auto grid max-w-[1280px] items-start gap-8 px-5 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:gap-20">
          <div>
            <h2 className="max-w-[14ch] text-4xl font-bold leading-[1.08] tracking-[-.045em] text-[#25275B] md:text-5xl">
              O que sua equipe pode fazer no TendiDesk
            </h2>
            <a href="#planos" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#004751] underline underline-offset-4">
              Comparar planos<ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <dl className="border-t border-[#DADBCF]">
            {features.map(feature => (
              <div key={feature.id} className="grid gap-2 border-b border-[#DADBCF] py-5 sm:grid-cols-[.85fr_1.15fr] sm:gap-6 sm:py-6">
                <dt className="text-lg font-bold leading-snug text-[#25275B]">{feature.title}</dt>
                <dd>
                  <p className="text-sm leading-6 text-slate-700">{feature.description}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{feature.detail}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-24 bg-[#004751] py-16 text-white md:py-20">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Como começar</h2>
          <ol className="mt-9 grid gap-6 md:grid-cols-3 md:gap-10">
            {steps.map(step => (
              <li key={step.number} className="border-t border-white/35 pt-5">
                <span aria-hidden="true" className="text-sm font-semibold text-[#ADE1D7]">{step.number}</span>
                <h3 className="mt-3 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-white/85">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
            <Reveal delayMs={150} className="order-2 min-w-0 rounded-xl bg-[#F7F8FC] p-3 sm:p-7 md:order-1"><PipelinePreview /></Reveal>
            <Reveal className="order-1 md:order-2"><p className="text-sm font-semibold text-[#8B1A73]">Gestão comercial</p><h2 className="mt-4 text-3xl font-bold leading-tight text-[#25275B] md:text-4xl">O relacionamento continua depois da primeira resposta.</h2><p className="mt-5 text-base leading-7 text-slate-600">Acompanhe oportunidades por etapa, organize prioridades e ajude o time a saber qual é o próximo passo de cada negociação.</p><div className="mt-6 flex items-start gap-3 rounded-xl border border-[#004751]/15 bg-[#F2F8F7] p-4"><Workflow size={20} className="mt-0.5 shrink-0 text-[#004751]" /><p className="text-sm leading-6 text-slate-600">Atendimento e CRM conectados para dar continuidade ao relacionamento com seus contatos.</p></div></Reveal>
          </div>
        </div>
      </section>

      <section className="bg-white py-20 md:py-24">
        <div className="mx-auto max-w-[1200px] px-5 md:px-6">
          <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
            <Reveal>
              <p className="text-sm font-semibold text-[#8B1A73]">Exclusivo do TendiDesk Pro</p>
              <h2 className="mt-4 text-3xl font-bold leading-tight text-[#25275B] md:text-4xl">Menos pedido de boleto para a equipe. Mais pagamento em dia.</h2>
              <p className="mt-5 text-base leading-7 text-slate-600">Quando o cliente pede a 2ª via pelo WhatsApp, Instagram ou chat do site, a Duda já pede o CPF ou CNPJ e envia a linha digitável e o PDF na hora — sem abrir chamado para a equipe.</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                <li className="flex gap-2"><CheckCircle2 size={17} className="shrink-0 text-emerald-600" />Conecta com Asaas, Pagar.me (Stone) ou Vindi</li>
                <li className="flex gap-2"><CheckCircle2 size={17} className="shrink-0 text-emerald-600" />Chave de API guardada com criptografia, ninguém da equipe vê depois de salva</li>
                <li className="flex gap-2"><CheckCircle2 size={17} className="shrink-0 text-emerald-600" />Funciona em qualquer canal com IA ligada</li>
              </ul>
              <Link href="/register?plano=tendi_pro" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#004751]">Conhecer o plano Pro<ArrowRight size={16} /></Link>
            </Reveal>
            <Reveal delayMs={150} className="min-w-0 rounded-xl bg-[#F7F8FC] p-3 sm:p-7"><BoletoAutomationPreview /></Reveal>
          </div>
        </div>
      </section>

      <section id="planos" className="scroll-mt-24 bg-[#F8F7F1] py-16 md:py-24">
        <div className="mx-auto max-w-[1200px] px-5 md:px-6">
          <div className="mx-auto max-w-2xl text-center"><h2 className="text-4xl font-bold tracking-tight text-[#25275B] md:text-5xl">Planos TendiDesk</h2><p className="mt-4 text-base leading-7 text-slate-600">Comece com {trialLabel} de teste grátis, sem cartão. Depois, escolha o plano mensal ou anual que acompanha o tamanho da sua equipe.</p></div>
          <Pricing plans={plans} trialLabel={trialLabel} />
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 bg-white py-20 md:py-24">
        <div className="mx-auto max-w-[850px] px-5 md:px-6"><h2 className="text-4xl font-bold tracking-tight text-[#25275B]">Dúvidas frequentes</h2><div className="mt-8 divide-y divide-slate-200">{faqs.map((faq) => <details key={faq.question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-[#25275B]">{faq.question}<ChevronDown aria-hidden="true" size={18} className="shrink-0 text-[#25275B] group-open:rotate-180" /></summary><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{faq.answer}</p></details>)}</div></div>
      </section>

      <section className="bg-[#25275B] py-16 text-white md:py-20">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 px-5 md:flex-row md:items-center md:px-6"><div><h2 className="max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">Experimente com sua equipe.</h2><p className="mt-4 text-sm text-white/70">Experimente o TendiDesk por {trialLabel}, sem cadastrar cartão.</p></div><Link href="/register" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-[#2F316B] transition hover:-translate-y-0.5 hover:bg-slate-100">Começar teste grátis<ArrowRight size={17} /></Link></div>
      </section>
    </>
  );
}
