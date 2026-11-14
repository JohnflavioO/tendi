import { canAccessArea, type Area, type Role } from './team';

/** Evento que reabre o guia de primeiros passos (atalho no menu lateral e no menu "..."). */
export const TOUR_EVENT = 'tendidesk:tour';
/** Marca no perfil de login (user_metadata) de quem já viu ou fechou o guia. */
export const TOUR_DONE_KEY = 'onboarding_tour_done_at';

export type TourStep = {
  id: string;
  /** Valor de data-tour do elemento destacado. Sem alvo (ou alvo escondido): balão centralizado. */
  target?: string;
  /** Só aparece para quem tem acesso a essa área. */
  area?: Area;
  title: string;
  body: string;
  /** Atalho "Ir agora" do passo. */
  action?: { label: string; href: string };
};

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'welcome', title: 'Boas-vindas ao TendiDesk', body: 'Em menos de um minuto mostramos o caminho para colocar o atendimento no ar e tirar o máximo do TendiDesk. Você pode pular e rever quando quiser.' },
  { id: 'connect', target: 'nav-chatbots', area: 'chatbots', title: 'Conecte seu WhatsApp', body: 'Comece por aqui: em Conexões você lê o QR Code com o celular da empresa e as conversas passam a chegar no TendiDesk.', action: { label: 'Conectar agora', href: '/chatbots' } },
  { id: 'ai', target: 'nav-ia', area: 'ia', title: 'Ative o Agente de IA', body: 'Ensine sobre o seu negócio, horários e preços. A IA responde os clientes 24h e passa para um humano quando precisar.', action: { label: 'Configurar IA', href: '/ia' } },
  { id: 'team', target: 'nav-equipe', area: 'equipe', title: 'Convide sua equipe', body: 'Cada atendente ganha o próprio login e papel. Assim você sabe quem atendeu cada cliente.', action: { label: 'Convidar pessoas', href: '/equipe' } },
  { id: 'settings', target: 'nav-configuracoes', area: 'configuracoes', title: 'Setores e assinatura', body: 'Crie setores como Comercial e Suporte e escolha como o nome do atendente aparece no WhatsApp do cliente. Seu e-mail de acesso também fica aqui.' },
  { id: 'inbox', target: 'nav-inbox', area: 'inbox', title: 'Atenda tudo no Inbox', body: 'Todas as conversas num só lugar: assuma, transfira para um setor, envie áudios e acompanhe o que a IA respondeu.' },
  { id: 'crm', target: 'nav-crm', area: 'crm', title: 'Transforme conversas em vendas', body: 'No CRM cada cliente vira um card no funil. Arraste entre as etapas e não perca nenhuma oportunidade.' },
  { id: 'restart', target: 'tour-restart', title: 'Reveja quando quiser', body: 'Fechou sem querer? Este atalho reabre o guia de primeiros passos a qualquer momento.' },
];

/** Passos que fazem sentido para o papel da pessoa na empresa. */
export function tourStepsFor(role: Role | null | undefined, superAdmin = false): TourStep[] {
  return TOUR_STEPS.filter(step => !step.area || canAccessArea(role, superAdmin, step.area));
}

/** Abre sozinho só no primeiro acesso de quem trabalha na empresa (Super Admin sem vínculo não). */
export function shouldAutoStartTour(metadata: Record<string, unknown> | null | undefined, role: Role | null | undefined): boolean {
  return Boolean(role) && !metadata?.[TOUR_DONE_KEY];
}

export type Rect = { top: number; left: number; width: number; height: number };
export type Placement = { top: number; left: number; side: 'right' | 'bottom' | 'top' | 'center'; arrow: number };

/**
 * Posição do balão ao lado do elemento destacado, sempre dentro da tela.
 * Prefere à direita (itens do menu lateral); senão embaixo; senão em cima.
 * `arrow` é a distância da seta até o início do balão (no eixo da borda que encosta no alvo).
 */
export function placePopover(target: Rect | null, popover: { width: number; height: number }, viewport: { width: number; height: number }, gap = 14, margin = 12): Placement {
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
  if (!target) return { side: 'center', top: (viewport.height - popover.height) / 2, left: (viewport.width - popover.width) / 2, arrow: 0 };
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;
  if (target.left + target.width + gap + popover.width + margin <= viewport.width) {
    const top = clamp(centerY - popover.height / 2, margin, viewport.height - popover.height - margin);
    return { side: 'right', top, left: target.left + target.width + gap, arrow: clamp(centerY - top, 18, popover.height - 18) };
  }
  const left = clamp(centerX - popover.width / 2, margin, viewport.width - popover.width - margin);
  const arrow = clamp(centerX - left, 18, popover.width - 18);
  if (target.top + target.height + gap + popover.height + margin <= viewport.height) return { side: 'bottom', top: target.top + target.height + gap, left, arrow };
  if (target.top - gap - popover.height >= margin) return { side: 'top', top: target.top - gap - popover.height, left, arrow };
  return { side: 'center', top: (viewport.height - popover.height) / 2, left: (viewport.width - popover.width) / 2, arrow: 0 };
}
