'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {Menu,X,ArrowRight} from 'lucide-react';
import {navigation,siteContent} from '@/content/marketing/site';

export function MarketingHeader(){
 const [scrolled,setScrolled]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{const update=()=>setScrolled(window.scrollY>8);update();window.addEventListener('scroll',update,{passive:true});return()=>window.removeEventListener('scroll',update)},[]);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[open]);
 return <header className={`fixed inset-x-0 top-0 z-50 h-14 border-b transition-all md:h-16 ${scrolled||open?'border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl':'border-transparent bg-white/85 backdrop-blur-sm'}`}>
  <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-5 md:px-6">
   <Link href="/" aria-label="TendiDesk, início" className="inline-flex items-center"><img src="/brand/tendidesk-logo.png" alt="TendiDesk" width="1291" height="640" className="block h-11 w-auto object-contain md:h-12"/></Link>
   <nav aria-label="Navegação principal" className="hidden items-center gap-8 md:flex">{navigation.map(i=><a key={i.href} href={i.href} className="text-sm font-medium text-slate-600 hover:text-[#004751]">{i.label}</a>)}</nav>
   <div className="hidden items-center gap-3 md:flex"><Link href="/login" className="rounded-xl px-4 py-3 text-sm font-semibold text-[#2F316B] hover:bg-slate-100">{siteContent.loginLabel}</Link><Link href="/register" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#004751] px-5 text-sm font-semibold text-white hover:bg-[#003943]">{siteContent.primaryCta}<ArrowRight size={15}/></Link></div>
   <button type="button" className="inline-flex size-11 items-center justify-center rounded-xl text-[#2F316B] hover:bg-slate-100 md:hidden" aria-label={open?'Fechar menu':'Abrir menu'} aria-expanded={open} aria-controls="mobile-navigation" onClick={()=>setOpen(v=>!v)}>{open?<X/>:<Menu/>}</button>
  </div>
  {open&&<div id="mobile-navigation" className="absolute inset-x-0 top-full border-b border-slate-200 bg-white p-5 shadow-xl md:hidden"><nav aria-label="Navegação móvel" className="mx-auto flex max-w-[1200px] flex-col gap-1">{navigation.map(i=><a key={i.href} href={i.href} onClick={()=>setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{i.label}</a>)}<Link href="/login" onClick={()=>setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700">Entrar</Link><Link href="/register" onClick={()=>setOpen(false)} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white">Começar grátis <ArrowRight size={16}/></Link></nav></div>}
 </header>;
}
