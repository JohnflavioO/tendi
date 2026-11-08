import Image from 'next/image';
import Link from 'next/link';
import { siteContent } from '@/content/marketing/site';

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return <footer className="border-t border-white/10 bg-[#2F316B] text-white">
    <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-12 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:px-6">
      <div>
        <Link href="/" aria-label="Tendi, início" className="inline-flex items-center">
          <Image src="/brand/tendi-logo-dark.png" alt="Tendi" width={400} height={153} unoptimized className="block h-10 w-auto object-contain" />
        </Link>
        <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">{siteContent.footerDescription}</p>
      </div>
      <div><h2 className="text-sm font-bold text-white">Produto</h2><ul className="mt-4 space-y-3 text-sm text-white/65"><li><a href="/#recursos" className="hover:text-white">Recursos</a></li><li><a href="/#planos" className="hover:text-white">Planos</a></li><li><a href="/#faq" className="hover:text-white">Dúvidas frequentes</a></li></ul></div>
      <div><h2 className="text-sm font-bold text-white">Empresa</h2><ul className="mt-4 space-y-3 text-sm text-white/65"><li><Link href="/login" className="hover:text-white">Entrar</Link></li><li><Link href="/register" className="hover:text-white">Criar conta</Link></li></ul></div>
      <div><h2 className="text-sm font-bold text-white">Legal</h2><ul className="mt-4 space-y-3 text-sm text-white/65"><li><Link href="/privacidade" className="hover:text-white">Privacidade</Link></li><li><Link href="/termos" className="hover:text-white">Termos de uso</Link></li></ul></div>
    </div>
    <div className="border-t border-white/10"><div className="mx-auto max-w-[1200px] px-5 py-5 text-xs text-white/45 md:px-6">© {year} Tendi. Todos os direitos reservados.</div></div>
  </footer>;
}
