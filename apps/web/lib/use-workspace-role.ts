'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isRole, type Role } from '@/lib/team';
import { activeSupportSessions } from '@/lib/current-organization';

export type WorkspaceRole = {
  /** undefined = ainda carregando; null = sem acesso de trabalho nesta empresa. */
  role: Role | null | undefined;
  superAdmin: boolean;
  /** Acesso de suporte liberado pelo cliente: até quando vale (ISO). null quando não é um acesso de suporte. */
  supportUntil: string | null;
};

/**
 * Papel do usuário logado na empresa.
 * - Vínculo ativo: o papel do vínculo.
 * - Super Admin com acesso de suporte liberado pelo cliente: atua como dono enquanto o prazo valer.
 * - Super Admin sem nenhum dos dois: role null (só administra a conta pelo Console).
 */
export function useWorkspaceRole(organizationId?: string | null): WorkspaceRole {
  const [state, setState] = useState<WorkspaceRole>({ role: undefined, superAdmin: false, supportUntil: null });

  useEffect(() => {
    let active = true;
    if (!organizationId) return;
    (async () => {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const [{ data: admin }, { data: membership }, support] = await Promise.all([
        supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle(),
        supabase.from('organization_memberships').select('role,status').eq('organization_id', organizationId).eq('user_id', auth.user.id).maybeSingle(),
        activeSupportSessions(supabase, auth.user.id),
      ]);
      if (!active) return;
      const memberRole = membership?.status === 'active' && isRole(membership.role) ? membership.role : null;
      const session = admin ? support.find(item => item.organizationId === organizationId) : undefined;
      setState({
        role: memberRole ?? (session ? 'owner' : null),
        superAdmin: Boolean(admin),
        supportUntil: !memberRole && session ? session.expiresAt : null,
      });
    })().catch(() => { if (active) setState({ role: null, superAdmin: false, supportUntil: null }); });
    return () => { active = false; };
  }, [organizationId]);

  return state;
}
