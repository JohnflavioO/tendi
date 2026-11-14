'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { requestedOrganizationId, resolveCurrentOrganization } from '@/lib/current-organization';
import { WorkspaceShell } from '@/components/workspace-shell';
import { AccountCard } from '@/components/settings/account-card';
import { useWorkspaceRole } from '@/lib/use-workspace-role';

/** Minha conta: aberta para qualquer papel (o atendente não acessa Configurações). */
export default function AccountPage() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const supabase = createClient() as any;
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { organization } = await resolveCurrentOrganization<{ id: string }>(supabase, data.user.id, 'id', requestedOrganizationId());
      setOrganizationId(organization?.id ?? null);
    })().catch(() => undefined);
  }, []);
  const { role, superAdmin } = useWorkspaceRole(organizationId);

  return <WorkspaceShell title="Minha conta" description="Seu nome, e-mail de acesso e senha">
    <div className="grid max-w-4xl gap-5 xl:grid-cols-2"><AccountCard role={role} superAdmin={superAdmin} /></div>
  </WorkspaceShell>;
}
