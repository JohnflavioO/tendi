'use client';

import { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';

export function MobileInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const installed = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    setVisible(mobile && !installed && window.sessionStorage.getItem('td-install-dismissed') !== '1');
  }, []);

  if (!visible) return null;
  return <aside className="mb-4 rounded-2xl border border-tendi-lilac/30 bg-white p-3 shadow-card sm:hidden" aria-label="Instalar aplicativo">
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-tendi-mist text-tendi-indigo"><Download size={19}/></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-tendi-navy">TendiDesk no seu celular</p>
        <p className="text-xs text-slate-500">Acesso rápido e notificações no iPhone</p>
      </div>
      <button type="button" onClick={() => setExpanded(v => !v)} className="min-h-10 rounded-xl bg-tendi-indigo px-3 text-xs font-semibold text-white" aria-expanded={expanded}>Instalar</button>
      <button type="button" aria-label="Dispensar dica de instalação" onClick={() => { window.sessionStorage.setItem('td-install-dismissed', '1'); setVisible(false); }} className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500"><X size={17}/></button>
    </div>
    {expanded && <div className="mt-3 space-y-2 border-t border-tendi-line pt-3 text-xs leading-5 text-slate-600">
      <p className="flex items-start gap-2"><Share2 size={15} className="mt-0.5 shrink-0"/> <span><strong>iPhone:</strong> abra no Safari, toque em Compartilhar e escolha Adicionar à Tela de Início. Ative Abrir como App, quando disponível.</span></p>
      <p><strong>Android:</strong> no menu do navegador, toque em Instalar app ou Adicionar à tela inicial.</p>
      <p className="text-slate-400">A instalação é feita pelo navegador, não por uma loja de aplicativos.</p>
    </div>}
  </aside>;
}
