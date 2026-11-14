'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { withOrganization } from '@/lib/current-organization';
import { placePopover, shouldAutoStartTour, TOUR_DONE_KEY, TOUR_EVENT, tourStepsFor, type Placement, type Rect } from '@/lib/onboarding';
import type { Role } from '@/lib/team';

const PAD = 6;
const WIDTH = 340;

/** Primeiro elemento visível com o data-tour (o menu lateral existe em versão desktop e celular). */
function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return nodes.find(node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) ?? null;
}

/**
 * Guia de primeiros passos: destaca itens do menu com balões, um de cada vez.
 * Abre sozinho no primeiro acesso; depois só pelo atalho "Primeiros passos" (evento TOUR_EVENT).
 */
export function OnboardingTour({ organizationId, role, superAdmin }: { organizationId?: string | null; role?: Role | null; superAdmin?: boolean }) {
  const steps = tourStepsFor(role, superAdmin);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const popover = useRef<HTMLDivElement>(null);
  const step = steps[Math.min(index, steps.length - 1)];

  // Primeiro acesso: abre sozinho depois que o papel é conhecido.
  useEffect(() => {
    if (role === undefined) return;
    let active = true;
    (async () => {
      try { if (window.localStorage.getItem(TOUR_DONE_KEY)) return; } catch { /* sem armazenamento local */ }
      const { data } = await (createClient() as any).auth.getUser();
      if (active && shouldAutoStartTour(data.user?.user_metadata, role)) { setIndex(0); setOpen(true); }
    })().catch(() => undefined);
    return () => { active = false; };
  }, [role]);

  // Atalho para reabrir.
  useEffect(() => {
    const reopen = () => { setIndex(0); setOpen(true); };
    window.addEventListener(TOUR_EVENT, reopen);
    return () => window.removeEventListener(TOUR_EVENT, reopen);
  }, []);

  const finish = useCallback(() => {
    setOpen(false);
    const at = new Date().toISOString();
    try { window.localStorage.setItem(TOUR_DONE_KEY, at); } catch { /* sem armazenamento local */ }
    void (createClient() as any).auth.updateUser({ data: { [TOUR_DONE_KEY]: at } }).catch(() => undefined);
  }, []);

  // Acompanha o elemento destacado (rolagem, redimensionamento, menu que abre e fecha).
  useEffect(() => {
    if (!open || !step) return;
    const element = findTarget(step.target);
    element?.scrollIntoView({ block: 'nearest' });
    const measure = () => {
      const current = findTarget(step.target);
      const r = current?.getBoundingClientRect();
      setRect(r ? { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const timer = window.setInterval(measure, 500);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); window.clearInterval(timer); };
  }, [open, step]);

  useLayoutEffect(() => {
    if (!open || !popover.current) return;
    setPlacement(placePopover(rect, { width: popover.current.offsetWidth, height: popover.current.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
  }, [open, rect, index]);

  const next = useCallback(() => { if (index >= steps.length - 1) finish(); else setIndex(index + 1); }, [index, steps.length, finish]);
  const back = useCallback(() => setIndex(Math.max(0, index - 1)), [index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      else if (event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, back, finish]);

  if (!open || !step) return null;
  const last = index === steps.length - 1;
  const numbered = steps.slice(1, -1);
  const stepNumber = numbered.findIndex(item => item.id === step.id) + 1;
  const side = placement?.side ?? 'center';
  const arrowStyle: React.CSSProperties = side === 'right' ? { left: -7, top: (placement?.arrow ?? 0) - 7 } : side === 'bottom' ? { top: -7, left: (placement?.arrow ?? 0) - 7 } : { bottom: -7, left: (placement?.arrow ?? 0) - 7 };

  return <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    {/* Fundo escurecido com "buraco" sobre o elemento destacado. */}
    {rect
      ? <div className="tendi-tour-spot pointer-events-none fixed rounded-2xl transition-all duration-300 ease-out" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      : <div className="fixed inset-0 bg-[#0F1132]/55 backdrop-blur-[2px] transition-opacity" />}
    <button aria-label="Fechar guia" className="fixed inset-0 cursor-default" onClick={finish} />

    <div ref={popover} key={step.id} className="tendi-tour-pop fixed overflow-visible rounded-2xl bg-white shadow-2xl shadow-[#0F1132]/30 ring-1 ring-slate-900/5" style={{ width: `min(${WIDTH}px, calc(100vw - 24px))`, top: placement?.top ?? -9999, left: placement?.left ?? -9999 }}>
      {side !== 'center' && <span aria-hidden className="absolute size-3.5 rotate-45 rounded-[3px] bg-white" style={arrowStyle} />}
      <div className="relative overflow-hidden rounded-2xl">
        {(index === 0 || last) && <div className="h-1.5 bg-gradient-to-r from-[#2F316B] via-[#7C7EC0] to-[#CB0A9F]" />}
        <div className="p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FCEAF7] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#CB0A9F]">
              <Sparkles size={11} />{stepNumber > 0 ? `Passo ${stepNumber} de ${numbered.length}` : 'Primeiros passos'}
            </span>
            <button onClick={finish} aria-label="Fechar guia" className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"><X size={16} /></button>
          </div>
          <h2 id="tour-title" className="text-base font-bold tracking-tight text-[#25275B]">{step.title}</h2>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">{step.body}</p>
          {step.action && <a href={withOrganization(step.action.href, organizationId)} onClick={finish} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#004751] hover:underline">{step.action.label}<ArrowRight size={12} /></a>}
          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1" aria-hidden>{steps.map((item, i) => <span key={item.id} className={i === index ? 'h-1.5 w-4 rounded-full bg-[#2F316B] transition-all' : i < index ? 'size-1.5 rounded-full bg-[#7C7EC0] transition-all' : 'size-1.5 rounded-full bg-slate-200 transition-all'} />)}</div>
            <div className="flex items-center gap-1.5">
              {index === 0
                ? <button onClick={finish} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">Pular</button>
                : <button onClick={back} aria-label="Voltar" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft size={15} /></button>}
              <button onClick={next} autoFocus className="inline-flex items-center gap-1.5 rounded-xl bg-[#2F316B] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#25275B]">
                {index === 0 ? 'Começar' : last ? 'Concluir' : 'Próximo'}{!last && <ArrowRight size={13} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
