'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isRole, type Role } from '@/lib/team';

/**
 * Papel do usuário logado na empresa e se ele é Super Admin da plataforma.
 * role: undefined = ainda carregando; null = sem vínculo ativo (caso do Super Admin nas empresas dos clientes).
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
      // O papel vem só do vínculo com a empresa. Ser Super Admin não dá papel de dono:
      // ele administra a conta pelo Console e não entra nos atendimentos.
      setState({ role: membership?.status === 'active' && isRole(membership.role) ? membership.role : null, superAdmin: Boolean(admin) });
    })().catch(() => { if (active) setState({ role: null, superAdmin: false }); });
    return () => { active = false; };
  }, [organizationId]);

  return state;
}
