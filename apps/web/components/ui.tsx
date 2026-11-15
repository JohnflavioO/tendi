import type { LucideIcon } from 'lucide-react';

/**
 * Peças visuais compartilhadas do painel do cliente e do Console. Usam as classes `td-*`
 * de app/globals.css, para que cartões, métricas, selos e estados vazios tenham o mesmo acabamento.
 */

type Tone = 'indigo' | 'magenta' | 'teal';
const ICON_TONE: Record<Tone, string> = { indigo: 'td-icon', magenta: 'td-icon td-icon-magenta', teal: 'td-icon td-icon-teal' };

export function IconTile({ icon: Icon, tone = 'indigo', size = 18, className = '' }: { icon: LucideIcon; tone?: Tone; size?: number; className?: string }) {
  return <span className={`${ICON_TONE[tone]} ${className}`}><Icon size={size} strokeWidth={1.9} /></span>;
}

/** Cartão com cabeçalho opcional (ícone, título, descrição e ações à direita). */
export function Card({ title, description, icon, tone = 'indigo', actions, children, className = '', bodyClassName = 'p-5 sm:p-6', id }: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return <section id={id} className={`td-card ${className}`}>
    {(title || actions) && <header className="flex flex-wrap items-start justify-between gap-3 border-b border-tendi-line/70 px-5 py-4 sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <IconTile icon={icon} tone={tone} size={17} className="!size-9" />}
        <div className="min-w-0">
          {title && <h2 className="td-title">{title}</h2>}
          {description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>}
    {children !== undefined && <div className={bodyClassName}>{children}</div>}
  </section>;
}

/** Indicador numérico (topo das telas). `accent` destaca o valor com a cor da marca. */
export function Metric({ label, value, hint, icon, tone = 'indigo', accent = false, className = '' }: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  accent?: boolean;
  className?: string;
}) {
  return <div className={`td-card group relative overflow-hidden p-4 sm:p-5 ${className}`}>
    <div className="flex items-start justify-between gap-3">
      <p className="td-eyebrow min-w-0">{label}</p>
      {icon && <IconTile icon={icon} tone={tone} size={16} className="!hidden !size-8 !rounded-lg sm:!inline-flex" />}
    </div>
    <p className={`mt-3 whitespace-nowrap text-[22px] font-semibold leading-none tracking-tight tabular-nums sm:text-[26px] ${accent ? 'text-tendi-teal' : 'text-tendi-navy'}`}>{value}</p>
    {hint && <p className="mt-2 text-[11.5px] leading-4 text-slate-400 sm:text-xs">{hint}</p>}
  </div>;
}

type BadgeTone = 'neutral' | 'indigo' | 'magenta' | 'teal' | 'success' | 'warning' | 'danger';
export function Badge({ tone = 'neutral', children, className = '', dot = false }: { tone?: BadgeTone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return <span className={`td-badge td-badge-${tone} ${className}`}>{dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}{children}</span>;
}

/** Estado vazio ou de aviso, centralizado, com ícone em bloco. */
export function EmptyState({ icon: Icon, title, description, action, className = '' }: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return <div className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
    <span className="relative flex size-14 items-center justify-center rounded-2xl bg-white text-tendi-lilac shadow-card ring-1 ring-tendi-line">
      <Icon size={24} strokeWidth={1.7} />
    </span>
    <p className="mt-4 text-sm font-semibold text-tendi-navy">{title}</p>
    {description && <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-slate-500">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>;
}

/** Tela inteira de aviso (sem acesso, empresa não encontrada etc.). */
export function FullPageNotice({ icon, title, description, action }: { icon: LucideIcon; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-tendi-haze p-6">
    <div className="td-card w-full max-w-md"><EmptyState icon={icon} title={title} description={description} action={action} /></div>
  </main>;
}
