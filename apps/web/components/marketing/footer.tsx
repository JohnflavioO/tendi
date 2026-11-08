import Link from 'next/link';
import { siteContent } from '@/content/marketing/site';

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return <footer className="border-t border-slate-200 bg-white">
    <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-12 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:px-6">
      <div><Link href="/" className="text-2xl font-extrabold tracking-tight text-[#2F316B]">tendi<span className="text-[#CB0A9F]">.</span></Link><p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">{siteContent.footerDescription}</p></div>
      <div><h2 className="text-sm font-bold text-[#25275B]">Produto</h2><ul className="mt-4 space-y-3 text-sm text-slate-500"><li><a href="/#recursos" className="hover:text-[#004751]">Recursos</a></li><li><a href="/#planos" className="hover:text-[#004751]">Planos</a></li><li><a href="/#faq" className="hover:text-[#004751]">Dúvidas frequentes</a></li></ul></div>
      <div><h2 className="text-sm font-bold text-[#25275B]">Empresa</h2><ul className="mt-4 space-y-3 text-sm text-slate-500"><li><Link href="/login" className="hover:text-[#004751]">Entrar</Link></li><li><Link href="/register" className="hover:text-[#004751]">Criar conta</Link></li></ul></div>
      <div><h2 className="text-sm font-bold text-[#25275B]">Legal</h2><ul className="mt-4 space-y-3 text-sm text-slate-500"><li><Link href="/privacidade" className="hover:text-[#004751]">Privacidade</Link></li><li><Link href="/termos" className="hover:text-[#004751]">Termos de uso</Link></li></ul></div>
    </div>
    <div className="border-t border-slate-100"><div className="mx-auto max-w-[1200px] px-5 py-5 text-xs text-slate-400 md:px-6">© {year} Tendi. Todos os direitos reservados.</div></div>
  </footer>;
}
