import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { dapiRequest } from '@/lib/dapi';
import { runAgendaReminders } from '@/lib/agenda-reminders-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/cron/agenda-reminders
 * Chamado pelo agendador do banco a cada 10 minutos. Envia os lembretes da agenda que estão na hora.
 * Autorização: "Authorization: Bearer <segredo>", onde o segredo é o platform_settings 'cron_secret',
 * gerado dentro do banco. Não há sessão de usuário aqui.
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
    const result = await runAgendaReminders(admin as any, {
      send: (path, body) => dapiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) }),
    });
    console.info('[Agenda] lembretes', result);
    return NextResponse.json({ success: true, ...result });
  } catch (cause) {
    console.error('[Agenda] falha nos lembretes', { message: cause instanceof Error ? cause.message : String(cause) });
    return NextResponse.json({ success: false, error: 'Falha ao enviar os lembretes.' }, { status: 500 });
  }
}
