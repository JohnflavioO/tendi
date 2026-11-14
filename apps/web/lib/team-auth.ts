import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthOps } from '@/lib/team-server';

/**
 * Operações do Supabase Auth para convites de equipe (somente no servidor).
 * - invite: cria a conta e manda o e-mail de convite ("Invite user"), com os dados que personalizam o modelo:
 *   {{ .Data.organization_name }}, {{ .Data.inviter_name }}, {{ .Data.role_label }} e {{ .Data.full_name }}.
 * - resend: conta já criada que nunca entrou recebe um novo link de acesso por e-mail.
 * O primeiro acesso cai em /auth/callback, que ativa o convite e leva para /definir-senha.
 */
export function teamAuthOps(admin: SupabaseClient<any, any, any>, origin: string): AuthOps {
  const redirectTo = `${origin}/auth/callback`;
  return {
    async invite(email, fullName, context) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: fullName,
          needs_password: true,
          organization_name: context.organizationName,
          inviter_name: context.inviterName,
          role_label: context.roleLabel,
        },
        redirectTo,
      });
      if (error || !data?.user?.id) throw error ?? new Error('Convite sem usuário.');
      return data.user.id;
    },
    async resend(email) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) throw new Error('Supabase não configurado no servidor.');
      const anon = createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
      if (error) throw error;
    },
    async isActivated(userId) {
      const { data } = await admin.auth.admin.getUserById(userId);
      const user = data?.user;
      return Boolean(user?.last_sign_in_at) && !user?.user_metadata?.needs_password;
    },
  };
}
