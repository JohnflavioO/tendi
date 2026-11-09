'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sendInboxMessageSchema, switchWorkspaceSchema } from '@tendi/shared';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

const WORKSPACE_COOKIE = 'tendi_workspace';
const PREVIOUS_WORKSPACE_COOKIE = 'tendi_previous_workspace';
const COOKIE_AGE = 60 * 60 * 24 * 365;

type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'agent';
type WorkspaceMembership = Pick<Database['public']['Tables']['organization_memberships']['Row'], 'organization_id' | 'role'>;

function setWorkspaceCookie(id: string) {
  cookies().set(WORKSPACE_COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_AGE,
  });
}

async function getIdentity() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) redirect('/login');

  const [{ data: admin }, { data: memberships }, { data: profile }] = await Promise.all([
    supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle(),
    supabase.from('organization_memberships').select('organization_id,role').eq('user_id', auth.user.id).eq('status', 'active'),
    supabase.from('profiles').select('last_workspace_id,full_name,email,avatar_url').eq('id', auth.user.id).maybeSingle(),
  ]);

  return {
    supabase,
    user: auth.user,
    isSuperAdmin: Boolean(admin),
    memberships: (memberships ?? []) as WorkspaceMembership[],
    profile,
  };
}

export async function getWorkspaceContext() {
  const identity = await getIdentity();
  const { data: organizations, error } = await identity.supabase
    .from('organizations').select('id,name').order('name');
  if (error) throw new Error('Não foi possível carregar seus workspaces.');

  const allowed = organizations ?? [];
  const membershipByOrg = new Map(identity.memberships.map(item => [item.organization_id, item.role as WorkspaceRole]));
  const workspaces = allowed
    .filter(org => identity.isSuperAdmin || membershipByOrg.has(org.id))
    .map(org => ({
      id: org.id,
      name: org.name,
      role: membershipByOrg.get(org.id) ?? null,
      platformOnly: identity.isSuperAdmin && !membershipByOrg.has(org.id),
    }));

  const cookieId = cookies().get(WORKSPACE_COOKIE)?.value;
  const preferredId = cookieId ?? identity.profile?.last_workspace_id ?? '';
  const active = workspaces.find(item => item.id === preferredId) ?? workspaces[0] ?? null;
  if (active && active.id !== cookieId) setWorkspaceCookie(active.id);

  return {
    workspaces,
    activeWorkspaceId: active?.id ?? '',
    activeRole: active?.role ?? null,
    isSuperAdmin: identity.isSuperAdmin,
    isViewingAsSuperAdmin: Boolean(active?.platformOnly),
    previousWorkspaceId: cookies().get(PREVIOUS_WORKSPACE_COOKIE)?.value ?? '',
    user: {
      id: identity.user.id,
      name: identity.profile?.full_name || identity.user.user_metadata.full_name || identity.user.email || 'Usuário',
      email: identity.profile?.email || identity.user.email || '',
      avatarUrl: identity.profile?.avatar_url ?? null,
    },
  };
}

async function resolveActiveWorkspace() {
  const identity = await getIdentity();
  const organizationId = cookies().get(WORKSPACE_COOKIE)?.value;
  if (!organizationId) throw new Error('Selecione um workspace para continuar.');

  const isMember = identity.memberships.some(item => item.organization_id === organizationId);
  if (!isMember && !identity.isSuperAdmin) throw new Error('Você não tem acesso a este workspace.');

  const { data: organization, error } = await identity.supabase
    .from('organizations').select('id,name').eq('id', organizationId).maybeSingle();
  if (error || !organization) throw new Error('O workspace selecionado não está disponível.');

  return { ...identity, organization };
}

export async function switchWorkspace(formData: FormData) {
  const parsed = switchWorkspaceSchema.safeParse({
    organizationId: formData.get('organizationId'),
    returnTo: formData.get('returnTo') || '/inbox',
  });
  if (!parsed.success) throw new Error('Não foi possível selecionar esse workspace.');

  const identity = await getIdentity();
  const { organizationId, returnTo } = parsed.data;
  const isMember = identity.memberships.some(item => item.organization_id === organizationId);
  if (!isMember && !identity.isSuperAdmin) throw new Error('Você não tem acesso a este workspace.');

  const { data: organization, error: organizationError } = await identity.supabase
    .from('organizations').select('id').eq('id', organizationId).maybeSingle();
  if (organizationError || !organization) throw new Error('Workspace não encontrado.');

  const previousId = cookies().get(WORKSPACE_COOKIE)?.value;
  if (previousId && previousId !== organizationId) {
    cookies().set(PREVIOUS_WORKSPACE_COOKIE, previousId, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: COOKIE_AGE,
    });
  }

  const { error: profileError } = await identity.supabase
    .from('profiles').update({ last_workspace_id: organizationId }).eq('id', identity.user.id);
  if (profileError) throw new Error('Não foi possível salvar seu workspace preferido.');

  if (identity.isSuperAdmin && !isMember) {
    const forwarded = headers().get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || headers().get('x-real-ip') || null;
    const { error: auditError } = await identity.supabase.from('audit_log').insert({
      company_id: organizationId,
      actor_id: identity.user.id,
      action: 'workspace_access',
      ip_address: ipAddress,
    });
    if (auditError) throw new Error('Não foi possível registrar o acesso administrativo.');
  }

  setWorkspaceCookie(organizationId);
  revalidatePath('/', 'layout');
  redirect(returnTo);
}

export async function exitWorkspaceView() {
  const previousId = cookies().get(PREVIOUS_WORKSPACE_COOKIE)?.value;
  if (!previousId) redirect('/admin');

  const identity = await getIdentity();
  const isMember = identity.memberships.some(item => item.organization_id === previousId);
  if (!isMember && !identity.isSuperAdmin) redirect('/admin');

  const { error } = await identity.supabase.from('organizations').select('id').eq('id', previousId).single();
  if (error) redirect('/admin');

  setWorkspaceCookie(previousId);
  cookies().delete(PREVIOUS_WORKSPACE_COOKIE);
  await identity.supabase.from('profiles').update({ last_workspace_id: previousId }).eq('id', identity.user.id);
  revalidatePath('/', 'layout');
  redirect('/inbox');
}

export async function loadInbox() {
  const { supabase, organization } = await resolveActiveWorkspace();
  const { data: conversations, error: conversationError } = await supabase
    .from('conversations')
    .select('id,organization_id,contact_id,team_id,assigned_to,channel,status,unread_count,last_message_at,contacts(id,full_name,phone_e164,email,tags,opt_in),teams(id,name,color)')
    .eq('organization_id', organization.id)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (conversationError) throw new Error('Não foi possível carregar as conversas.');

  const rows = (conversations ?? []) as unknown as Array<Record<string, unknown> & { id: string }>;
  const ids = rows.map(item => item.id);
  const { data: messages, error: messagesError } = ids.length
    ? await supabase.from('messages')
      .select('id,conversation_id,direction,message_type,body,created_at,delivery_status,sender_id')
      .eq('organization_id', organization.id).in('conversation_id', ids).order('created_at')
    : { data: [], error: null };
  if (messagesError) throw new Error('Não foi possível carregar as mensagens.');

  const { data: channels } = await supabase
    .from('channel_connections').select('id,channel,status')
    .eq('organization_id', organization.id).eq('channel', 'whatsapp');

  const membership = await identityRole(supabase, organization.id);
  return {
    organizationId: organization.id,
    conversations: rows,
    messages: messages ?? [],
    whatsappConnected: (channels ?? []).some(channel => channel.status === 'connected'),
    canManageChannels: membership === 'owner' || membership === 'admin',
  };
}

async function identityRole(supabase: SupabaseClient<Database>, organizationId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from('organization_memberships')
    .select('role').eq('organization_id', organizationId).eq('user_id', auth.user.id).eq('status', 'active').maybeSingle();
  return data?.role ?? null;
}

export async function sendInboxMessage(input: unknown) {
  const parsed = sendInboxMessageSchema.safeParse(input);
  if (!parsed.success) throw new Error('Revise a mensagem antes de enviar.');

  const { supabase, organization, user } = await resolveActiveWorkspace();
  const { conversationId, body } = parsed.data;
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations').select('id').eq('id', conversationId)
    .eq('organization_id', organization.id).maybeSingle();
  if (conversationError || !conversation) throw new Error('Conversa não encontrada neste workspace.');

  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from('messages').insert({
    organization_id: organization.id,
    conversation_id: conversationId,
    direction: 'outbound',
    message_type: 'text',
    body,
    delivery_status: 'queued',
    sender_id: user.id,
    sent_at: now,
  });
  if (insertError) throw new Error('Não foi possível registrar a mensagem.');

  const { error: updateError } = await supabase.from('conversations')
    .update({ last_message_at: now, status: 'open' })
    .eq('id', conversationId).eq('organization_id', organization.id);
  if (updateError) throw new Error('A mensagem foi registrada, mas não foi possível atualizar a conversa.');
}
