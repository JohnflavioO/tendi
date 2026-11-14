/**
 * Ícone do "i" do TendiDesk animado, para usar nas telas de carregamento de página
 * (workspace, inbox, etc.). Reaproveita o traçado vetorial do logo oficial
 * (o "i" da marca TendiDesk, o mesmo do ícone da aba em app/icon.svg): o acento balança e o ponto pulsa.
 */
export function BrandLoader({ label, size = 40 }: { label?: string; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <svg width={size} height={size} viewBox="690 -6 94 94" aria-hidden="true">
        <path className="tendi-load-arc" fill="#2F316B" d="M 733,0 A 31,31 0 0 1 761,47 A 39,39 0 0 0 706,47 A 31,31 0 0 1 733,0 Z" />
        <path className="tendi-load-dot" fill="#CB0A9F" d="M 734,41 A 32,32 0 1 1 733.9,41 Z" />
      </svg>
      {label && <p className="text-xs font-medium text-slate-400">{label}</p>}
      <span className="sr-only">{label ?? 'Carregando…'}</span>
    </div>
  );
}
