'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Anima a entrada do conteúdo quando ele cruza a viewport (um IntersectionObserver só, leve,
 * que desliga a observação assim que revela — não fica rodando depois). Sem o observer
 * disponível (navegador antigo) ou com "prefers-reduced-motion", mostra o conteúdo direto.
 */
export function Reveal({ children, delayMs = 0, className = '' }: { children: React.ReactNode; delayMs?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${className} transition-all duration-700 ease-out ${visible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`} style={{ transitionDelay: visible ? `${delayMs}ms` : '0ms' }}>
      {children}
    </div>
  );
}
