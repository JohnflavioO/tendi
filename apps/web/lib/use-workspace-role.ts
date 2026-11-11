'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isRole, type Role } from '@/lib/team';

/**
 * Papel do usuário logado na empresa (Super Admin conta como dono).
 * undefined = ainda carregando; null = sem vínculo ativo.
 */
export function useWorkspaceRole(organizationId?: string | null): { role: Role | null | undefined; superAdmin: boolean } {
  const [state, setState] = useState<{ role: Role | null | undefined; superAdmin: boolean }>({ role: undefined, superAdmin: false });

  useEffect(() => {
    let active = true;
    if (!organizationId) return;
    (async () => {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const [{ data: admin }, { data: membership }] = await Promise.all([
        supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle(),
        supabase.from('organization_memberships').select('role,status').eq('organization_id', organizationId).eq('user_id', auth.user.id).maybeSingle(),
      ]);
      if (!active) return;
      if (admin) setState({ role: 'owner', superAdmin: true });
      else setState({ role: membership?.status === 'active' && isRole(membership.role) ? membership.role : null, superAdmin: false });
    })().catch(() => { if (active) setState({ role: null, superAdmin: false }); });
    return () => { active = false; };
  }, [organizationId]);

  return state;
}
