'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isRole, type Role } from '@/lib/team';
import { activeSupportSessions } from '@/lib/current-organization';
import { FRESH_MS, patchWorkspace, peekWorkspace, readWorkspace } from '@/lib/workspace-cache';

export type WorkspaceRole = {
  /** undefined = ainda carregando; null = sem acesso de trabalho nesta empresa. */
  role: Role | null | undefined;
  superAdmin: boolean;
  /** Acesso de suporte liberado pelo cliente: até quando vale (ISO). null quando não é um acesso de suporte. */
  supportUntil: string | null;
};

/** Papel já conhecido desta empresa, guardado na memória da aba (troca de tela sem nova consulta). */
function cachedRole(organizationId?: string | null, firstRender = false): WorkspaceRole | null {
  if (!organizationId) return null;
  const snapshot = firstRender ? peekWorkspace(organizationId) : readWorkspace(organizationId);
  if (!snapshot || snapshot.organization?.id !== organizationId || !snapshot.roleCheckedAt) return null;
  return { role: snapshot.role, superAdmin: snapshot.superAdmin, supportUntil: snapshot.supportUntil };
}

/**
 * Papel do usuário logado na empresa.
 * - Vínculo ativo: o papel do vínculo.
 * - Super Admin com acesso de suporte liberado pelo cliente: atua como dono enquanto o prazo valer.
 * - Super Admin sem nenhum dos dois: role null (só administra a conta pelo Console).
 * Usa a memória da aba quando existe e só consulta de novo quando ela passa de 1 minuto.
 */
export function useWorkspaceRole(organizationId?: string | null): WorkspaceRole {
  const [state, setState] = useState<WorkspaceRole>(() => cachedRole(organizationId, true) ?? { role: undefined, superAdmin: false, supportUntil: null });

  useEffect(() => {
    let active = true;
    if (!organizationId) return;
    const cached = cachedRole(organizationId);
    if (cached) setState(cached);
    const snapshot = readWorkspace(organizationId);
    if (cached && snapshot?.roleCheckedAt && Date.now() - snapshot.roleCheckedAt < FRESH_MS) return;
    (async () => {
      const supabase = createClient() as any;
      // Sessão já salva no navegador: sem ida à rede só para saber quem está logado.
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id as string | undefined;
      if (!userId) return;
      const [{ data: admin }, { data: membership }, support] = await Promise.all([
        supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
        supabase.from('organization_memberships').select('role,status').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle(),
        activeSupportSessions(supabase, userId),
      ]);
      if (!active) return;
      const memberRole = membership?.status === 'active' && isRole(membership.role) ? membership.role : null;
      const session = admin ? support.find(item => item.organizationId === organizationId) : undefined;
      const next: WorkspaceRole = {
        role: memberRole ?? (session ? 'owner' : null),
        superAdmin: Boolean(admin),
        supportUntil: !memberRole && session ? session.expiresAt : null,
      };
      setState(next);
      if (readWorkspace(organizationId)?.organization?.id === organizationId) patchWorkspace({ ...next, role: next.role ?? null, roleCheckedAt: Date.now() });
    })().catch(() => { if (active && !cached) setState({ role: null, superAdmin: false, supportUntil: null }); });
    return () => { active = false; };
  }, [organizationId]);

  return state;
}
