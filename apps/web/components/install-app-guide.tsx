'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

export function InstallAppGuide() {
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const installed = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setShow(mobile && !installed);
  }, []);
  if (!show) return null;
  return <div className="mx-2 my-3 rounded-xl border border-white/15 bg-white/10 p-3 text-white">
    <button type="button" onClick={() => setExpanded(value => !value)}
      className="flex w-full items-center gap-2 text-left text-xs font-semibold">
      <Download size={17} className="shrink-0" />
      <span className="flex-1">Instalar TendiDesk no celular</span>
      <span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button>
    {expanded && <div className="mt-3 space-y-2 text-xs leading-5 text-white/85">
      <p>No iPhone: abra este endereço no Safari, toque em Compartilhar e escolha Adicionar à Tela de Início. Se aparecer, selecione Abrir como App.</p>
      <p>No Android: abra o menu do navegador e escolha Instalar app ou Adicionar à tela inicial.</p>
      <button type="button" onClick={() => setShow(false)} className="inline-flex items-center gap-1 text-white/70 underline"><X size={12}/>Dispensar</button>
    </div>}
  </div>;
}
