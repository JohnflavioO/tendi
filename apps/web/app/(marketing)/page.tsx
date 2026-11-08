import Link from 'next/link';
import { ArrowDownRight, ArrowRight } from 'lucide-react';
import { siteContent } from '@/content/marketing/site';
import { ProductPreview } from '@/components/marketing/product-preview';

export default function MarketingHome() {
  return <section className="relative isolate overflow-hidden bg-[#F7F8FC]">
    <div className="absolute -right-40 -top-24 -z-10 size-[560px] rounded-full bg-[#CB0A9F]/[.06] blur-3xl"/>
    <div className="mx-auto grid min-h-[680px] max-w-[1200px] items-center gap-16 px-5 pb-20 pt-20 md:grid-cols-2 md:px-6 md:pb-28 md:pt-24">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#CB0A9F]">{siteContent.eyebrow}</p>
        <h1 className="mt-5 max-w-xl text-[clamp(2.25rem,5vw,3.75rem)] font-extrabold leading-[1.08] tracking-[-.04em] text-[#25275B]">{siteContent.heroTitle}</h1>
        <p className="mt-6 max-w-[38rem] text-lg leading-8 text-slate-600">{siteContent.heroDescription}</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#004751] px-6 text-sm font-bold text-white shadow-lg shadow-[#004751]/15 transition hover:-translate-y-0.5 hover:bg-[#003943] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CB0A9F]">{siteContent.primaryCta}<ArrowRight size={17}/></Link>
          <a href="#recursos" className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-[#2F316B] transition hover:border-[#004751]"><ArrowDownRight size={16}/>{siteContent.secondaryCta}</a>
        </div>
        <p className="mt-5 text-xs text-slate-500">Teste gratuito de 14 dias. Sem cartão no cadastro.</p>
      </div>
      <ProductPreview/>
    </div>
  </section>;
}
