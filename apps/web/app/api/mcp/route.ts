import { timingSafeEqual } from 'node:crypto';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ORGANIZATION_ID = '637a9d9f-f621-4462-8445-dc3d2fd48304';
const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;

function authorized(request: Request) {
  const expected = process.env.TENDI_MCP_TOKEN;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\\s+/i, '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function getAdmin() {
  if (process.env.TENDI_MCP_ORGANIZATION_ID !== ORGANIZATION_ID) {
    throw new Error('O escopo da organização do TendiDesk Supervisor não está configurado corretamente.');
  }
  const admin = createAdminClient();
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL não configurado.');
  return admin;
}

const handler = createMcpHandler((server) => {
  server.tool(
    'resumo_operacional',
    'Retorna indicadores agregados da operação TendiDesk no período solicitado. Não retorna conteúdo de mensagens nem dados de outras organizações.',
    { dias: z.number().int().min(1).max(MAX_DAYS).default(DEFAULT_DAYS) },
    async ({ dias }) => {
      const admin = getAdmin();
      const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
      const [open, closed, recentMessages, conversations, messages] = await Promise.all([
        admin.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', ORGANIZATION_ID).eq('status', 'open'),
        admin.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', ORGANIZATION_ID).eq('status', 'closed').gte('updated_at', since),
        admin.from('messages').select('id', { count: 'exact', head: true }).eq('organization_id', ORGANIZATION_ID).gte('created_at', since),
        admin.from('conversations').select('channel,status').eq('organization_id', ORGANIZATION_ID).gte('created_at', since),
        admin.from('messages').select('direction').eq('organization_id', ORGANIZATION_ID).gte('created_at', since),
      ]);
      for (const result of [open, closed, recentMessages, conversations, messages]) {
        if (result.error) throw new Error('Falha ao consultar indicadores operacionais.');
      }
      const byChannel: Record<string, number> = {};
      for (const item of conversations.data ?? []) byChannel[item.channel] = (byChannel[item.channel] ?? 0) + 1;
      const byDirection: Record<string, number> = {};
      for (const item of messages.data ?? []) byDirection[item.direction] = (byDirection[item.direction] ?? 0) + 1;
      return jsonResult({
        organizacao: 'TendiDesk',
        periodo_dias: dias,
        conversas_abertas: open.count ?? 0,
        conversas_fechadas_no_periodo: closed.count ?? 0,
        mensagens_no_periodo: recentMessages.count ?? 0,
        conversas_por_canal_no_periodo: byChannel,
        mensagens_por_direcao_no_periodo: byDirection,
        atualizado_em: new Date().toISOString(),
      });
    },
  );

  server.tool(
    'listar_pendencias',
    'Lista conversas abertas com metadados para priorização. Não expõe o texto das mensagens, telefone ou e-mail do contato.',
    { limite: z.number().int().min(1).max(50).default(20) },
    async ({ limite }) => {
      const admin = getAdmin();
      const { data, error } = await admin
        .from('conversations')
        .select('id,channel,status,last_message_at,unread_count,assigned_to,contacts(full_name)')
        .eq('organization_id', ORGANIZATION_ID)
        .eq('status', 'open')
        .order('last_message_at', { ascending: true, nullsFirst: true })
        .limit(200);
      if (error) throw new Error('Falha ao consultar conversas pendentes.');
      const conversationIds = (data ?? []).map((item: any) => item.id);
      if (!conversationIds.length) return jsonResult([]);
      const { data: recentMessages, error: messagesError } = await admin
        .from('messages')
        .select('conversation_id,direction,created_at')
        .eq('organization_id', ORGANIZATION_ID)
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (messagesError) throw new Error('Falha ao identificar a última interação das conversas.');
      const latestByConversation = new Map<string, { direction: string; created_at: string }>();
      for (const message of recentMessages ?? []) {
        if (!latestByConversation.has(message.conversation_id)) {
          latestByConversation.set(message.conversation_id, {
            direction: message.direction,
            created_at: message.created_at,
          });
        }
      }
      const pending = (data ?? [])
        .filter((item: any) => latestByConversation.get(item.id)?.direction === 'inbound')
        .sort((a: any, b: any) => {
          const aDate = latestByConversation.get(a.id)?.created_at ?? '';
          const bDate = latestByConversation.get(b.id)?.created_at ?? '';
          return aDate.localeCompare(bDate);
        })
        .slice(0, limite);
      return jsonResult(pending.map((item: any) => ({
        conversa_id: item.id,
        contato: Array.isArray(item.contacts) ? item.contacts[0]?.full_name ?? null : item.contacts?.full_name ?? null,
        canal: item.channel,
        ultima_interacao_em: latestByConversation.get(item.id)?.created_at ?? item.last_message_at,
        mensagens_nao_lidas: item.unread_count,
        atendente_id: item.assigned_to,
      })));
    },
  );

  server.tool(
    'analisar_distribuicao',
    'Apresenta a distribuição de conversas abertas e fechadas por atendente, sem conteúdo das mensagens.',
    {},
    async () => {
      const admin = getAdmin();
      const { data: conversations, error } = await admin
        .from('conversations')
        .select('assigned_to,status')
        .eq('organization_id', ORGANIZATION_ID);
      if (error) throw new Error('Falha ao consultar distribuição de atendimentos.');
      const ids = [...new Set((conversations ?? []).map((item: any) => item.assigned_to).filter(Boolean))] as string[];
      const { data: profiles, error: profilesError } = ids.length
        ? await admin.from('profiles').select('id,full_name').in('id', ids)
        : { data: [], error: null };
      if (profilesError) throw new Error('Falha ao consultar nomes dos atendentes.');
      const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.full_name]));
      const grouped = new Map<string, { atendente_id: string | null; atendente: string; abertas: number; fechadas: number; total: number }>();
      for (const item of conversations ?? []) {
        const id = item.assigned_to ?? null;
        const key = id ?? 'unassigned';
        const current = grouped.get(key) ?? {
          atendente_id: id,
          atendente: id ? names.get(id) ?? 'Atendente sem nome' : 'Não atribuído',
          abertas: 0, fechadas: 0, total: 0,
        };
        if (item.status === 'open') current.abertas += 1;
        if (item.status === 'closed') current.fechadas += 1;
        current.total += 1;
        grouped.set(key, current);
      }
      return jsonResult([...grouped.values()].sort((a, b) => b.total - a.total));
    },
  );

  server.tool(
    'analisar_canais',
    'Compara o volume de conversas por canal e status na organização TendiDesk.',
    {},
    async () => {
      const admin = getAdmin();
      const { data, error } = await admin.from('conversations')
        .select('channel,status')
        .eq('organization_id', ORGANIZATION_ID);
      if (error) throw new Error('Falha ao consultar canais.');
      const grouped = new Map<string, { canal: string; abertas: number; fechadas: number; total: number }>();
      for (const item of data ?? []) {
        const current = grouped.get(item.channel) ?? { canal: item.channel, abertas: 0, fechadas: 0, total: 0 };
        if (item.status === 'open') current.abertas += 1;
        if (item.status === 'closed') current.fechadas += 1;
        current.total += 1;
        grouped.set(item.channel, current);
      }
      return jsonResult([...grouped.values()].sort((a, b) => b.total - a.total));
    },
  );
}, {}, { basePath: '/api', maxDuration: 30, disableSse: true });

async function withBearerAuth(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer realm="tendidesk-supervisor"' },
    });
  }
  return handler(request);
}

export const POST = withBearerAuth;
export const GET = withBearerAuth;
export const DELETE = withBearerAuth;
