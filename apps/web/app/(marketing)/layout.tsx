import type { ReactNode } from 'react';
import Script from 'next/script';
import { MarketingHeader } from '@/components/marketing/header';
import { MarketingFooter } from '@/components/marketing/footer';
import { SITE_WEBCHAT_KEY } from '@/lib/brand';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <>
    <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
    <MarketingHeader/>
    <main id="conteudo" className="pt-14 md:pt-16">{children}</main>
    <MarketingFooter/>
    {/* Chat do site: o mesmo widget que os clientes usam. Só aparece quando está ligado em Conexões › Webchat. */}
    {SITE_WEBCHAT_KEY && <Script src="/webchat.js" data-tendi-key={SITE_WEBCHAT_KEY} strategy="lazyOnload" />}
  </>;
}
