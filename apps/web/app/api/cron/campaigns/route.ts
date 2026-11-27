import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { dapiRequest } from '@/lib/dapi';
import { runCampaignBatch } from '@/lib/campaigns-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/cron/campaigns
 * Chamado pelo agendador do banco a cada minuto. Envia o próximo lote pendente de cada campanha
 * em andamento. Autorização: "Authorization: Bearer <segredo>", igual ao cron dos lembretes.
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });

  const header = request.headers.get('authorization') ?? '';
  const provided = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const { data: setting, error } = await admin.from('platform_settings').select('value').eq('key', 'cron_secret').maybeSingle();
  if (error) return NextResponse.json({ error: 'Não foi possível validar o agendador.' }, { status: 503 });
  const expected = typeof setting?.value === 'string' ? setting.value : '';
  if (expected.length < 32 || !provided || !sameSecret(provided, expected)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const result = await runCampaignBatch(admin as any, {
      send: (path, body) => dapiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) }),
    });
    console.info('[Campanhas]', result);
    return NextResponse.json({ success: true, ...result });
  } catch (cause) {
    console.error('[Campanhas] falha no processamento', { message: cause instanceof Error ? cause.message : String(cause) });
    return NextResponse.json({ success: false, error: 'Falha ao processar as campanhas.' }, { status: 500 });
  }
}
