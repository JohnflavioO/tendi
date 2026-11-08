import type { ReactNode } from 'react';
import { MarketingHeader } from '@/components/marketing/header';
import { MarketingFooter } from '@/components/marketing/footer';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <><a href="#conteudo" className="skip-link">Pular para o conteúdo</a><MarketingHeader/><main id="conteudo" className="pt-14 md:pt-16">{children}</main><MarketingFooter/></>;
}
