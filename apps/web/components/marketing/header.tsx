'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {useEffect,useState} from 'react';
import {Menu,X,ArrowRight} from 'lucide-react';
import {navigation,siteContent} from '@/content/marketing/site';

export function MarketingHeader(){
 const isHome = usePathname() === '/';
 const [scrolled,setScrolled]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{const update=()=>setScrolled(window.scrollY>8);update();window.addEventListener('scroll',update,{passive:true});return()=>window.removeEventListener('scroll',update)},[]);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[open]);
 return <header data-home={isHome} className={`peer inset-x-0 top-0 z-50 border-b transition-colors ${isHome ? 'sticky h-[4.5rem] md:h-[5.5rem]' : 'fixed h-14 md:h-16'} ${scrolled||open?'border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl':'border-transparent bg-white/85 backdrop-blur-sm'}`}>
  <div className={`mx-auto flex h-full items-center justify-between gap-3 ${isHome ? 'max-w-[1600px] px-4 sm:px-8' : 'max-w-[1200px] px-5 md:px-6'}`}>
   <Link href="/" aria-label="TendiDesk, início" className="inline-flex shrink-0 items-center"><img src="/brand/tendidesk-logo.png" alt="TendiDesk" width="1291" height="640" className={`block w-auto object-contain ${isHome ? 'h-[3.25rem] md:h-[3.75rem]' : 'h-11 md:h-12'}`}/></Link>
   <nav aria-label="Navegação principal" className={`hidden items-center md:flex ${isHome ? 'gap-1 rounded-lg bg-[#F3F2F7] p-1' : 'gap-4 lg:gap-8'}`}>
    {navigation.map(item => (
      <a key={item.href} href={item.href} className={`whitespace-nowrap text-sm font-medium text-slate-600 hover:text-[#004751] ${isHome ? 'rounded-md px-2.5 py-2.5 transition-colors hover:bg-white focus-visible:bg-white lg:px-4' : ''}`}>
        {item.label}
      </a>
    ))}
   </nav>
   <div className="hidden items-center gap-3 md:flex"><Link href="/login" className="rounded-xl px-4 py-3 text-sm font-semibold text-[#2F316B] hover:bg-slate-100">{siteContent.loginLabel}</Link><Link href="/register" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#004751] px-5 text-sm font-semibold text-white hover:bg-[#003943]">{siteContent.primaryCta}<ArrowRight size={15}/></Link></div>
   <button type="button" className="inline-flex size-11 items-center justify-center rounded-xl text-[#2F316B] hover:bg-slate-100 md:hidden" aria-label={open?'Fechar menu':'Abrir menu'} aria-expanded={open} aria-controls="mobile-navigation" onClick={()=>setOpen(v=>!v)}>{open?<X/>:<Menu/>}</button>
  </div>
  {open&&<div id="mobile-navigation" className="absolute inset-x-0 top-full border-b border-slate-200 bg-white p-5 shadow-xl md:hidden"><nav aria-label="Navegação móvel" className="mx-auto flex max-w-[1200px] flex-col gap-1">{navigation.map(i=><a key={i.href} href={i.href} onClick={()=>setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{i.label}</a>)}<Link href="/login" onClick={()=>setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700">Entrar</Link><Link href="/register" onClick={()=>setOpen(false)} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white">Começar grátis <ArrowRight size={16}/></Link></nav></div>}
 </header>;
}
