'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { navigation, siteContent } from '@/content/marketing/site';

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') {
        const items = document.querySelectorAll<HTMLElement>('[data-menu-focus]');
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 h-14 border-b transition-all duration-200 md:h-16 ${scrolled ? 'border-slate-200 bg-white/90 shadow-sm backdrop-blur-xl' : 'border-transparent bg-transparent'}`}>
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-5 md:px-6">
        <Link href="/" aria-label="Tendi, início" className="inline-flex items-center">
          <Image src="/brand/tendi-logo-light.png" alt="Tendi" width={400} height={153} priority unoptimized className="block h-9 w-auto object-contain md:h-10" />
        </Link>
        <nav aria-label="Navegação principal" className="hidden items-center gap-8 md:flex">
          {navigation.map(item => <a key={item.href} href={item.href} className="text-sm font-medium text-slate-600 transition hover:text-[#004751]">{item.label}</a>)}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="rounded-xl px-4 py-3 text-sm font-semibold text-[#2F316B] hover:bg-white/70">{siteContent.loginLabel}</Link>
          <Link href="/register" className="rounded-xl bg-[#004751] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#003943] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CB0A9F]">{siteContent.primaryCta}</Link>
        </div>
        <button type="button" className="inline-flex size-11 items-center justify-center rounded-xl text-[#2F316B] hover:bg-white md:hidden" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}><span className="sr-only">{open ? 'Fechar menu' : 'Abrir menu'}</span>{open ? <X /> : <Menu />}</button>
      </div>
      {open && <div id="mobile-navigation" className="absolute inset-x-0 top-full border-b border-slate-200 bg-white p-5 shadow-xl md:hidden">
        <nav aria-label="Navegação móvel" className="mx-auto flex max-w-[1200px] flex-col gap-1">
          {navigation.map(item => <a data-menu-focus key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{item.label}</a>)}
          <Link data-menu-focus href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700">Entrar</Link>
          <Link data-menu-focus href="/register" onClick={() => setOpen(false)} className="mt-2 rounded-xl bg-[#004751] px-4 py-3 text-center text-sm font-semibold text-white">Começar grátis</Link>
        </nav>
      </div>}
    </header>
  );
}
