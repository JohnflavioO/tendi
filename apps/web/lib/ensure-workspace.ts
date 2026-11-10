// Garante que quem se cadastrou pelo site tenha o workspace criado.
//
// O workspace nasce em /auth/callback, quando o link de confirmação volta para
// o app no mesmo navegador do cadastro. Se o cliente confirmar em outro
// navegador/dispositivo, ou o link cair fora do callback, a conta fica
// confirmada mas sem empresa. Esta função cobre esse caso: usa os dados
// guardados no cadastro (user_metadata) para concluir a criação.

type SupabaseLike = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
};

type UserLike = { user_metadata?: Record<string, unknown> | null } | null | undefined;

export type PendingWorkspace = { organizationName: string; planCode: string };

/** Dados do cadastro ainda não provisionado, ou null quando a conta não veio do cadastro público. */
export function pendingWorkspaceFromUser(user: UserLike): PendingWorkspace | null {
  const organizationName = user?.user_metadata?.organization_name;
  const planCode = user?.user_metadata?.plan_code;
  if (typeof organizationName !== 'string' || organizationName.trim().length < 2) return null;
  if (typeof planCode !== 'string' || !planCode) return null;
  return { organizationName: organizationName.trim(), planCode };
}

/**
 * Cria o workspace pendente do usuário. Chame somente quando ele não tiver
 * nenhuma empresa. Retorna true se criou; false se não havia nada a criar.
 * A função do banco recusa a criação se o usuário já tiver um workspace.
 */
export async function provisionPendingWorkspace(supabase: SupabaseLike, user: UserLike): Promise<boolean> {
  const pending = pendingWorkspaceFromUser(user);
  if (!pending) return false;
  const { error } = await supabase.rpc('provision_customer_workspace', {
    p_organization_name: pending.organizationName,
    p_plan_code: pending.planCode,
  });
  if (error) throw new Error(error.message);
  return true;
}
