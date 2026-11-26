import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dapiRequest } from '@/lib/dapi';
import { loadPublicAgenda, createPublicBooking } from '@/lib/agenda-public-server';

export const dynamic = 'force-dynamic';

type Context = { params: { slug: string } };

/**
 * POST /api/agenda-public/<slug>/book
 * Body: { professionalId, serviceId, day: "AAAA-MM-DD", startMinutes, customerName, customerPhone }
 * Cria o agendamento marcado pelo próprio cliente. Tudo é validado de novo aqui (horário ainda
 * livre, empresa com o recurso ligado, limite de tentativas por telefone): o navegador nunca
 * manda nada em que se possa confiar sozinho.
 */
export async function POST(request: Request, { params }: Context) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });
  const agenda = await loadPublicAgenda(admin, params.slug);
  if (!agenda) return NextResponse.json({ error: 'Agendamento não disponível.' }, { status: 404 });

  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const professionalId = typeof input.professionalId === 'string' ? input.professionalId : '';
  const serviceId = typeof input.serviceId === 'string' ? input.serviceId : '';
  const day = typeof input.day === 'string' ? input.day : '';
  const startMinutes = Number(input.startMinutes);
  const customerName = typeof input.customerName === 'string' ? input.customerName : '';
  const customerPhone = typeof input.customerPhone === 'string' ? input.customerPhone : '';
  if (!professionalId || !serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(startMinutes)) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const result = await createPublicBooking(admin, agenda, { professionalId, serviceId, day, startMinutes, customerName, customerPhone }, {
    send: (path, sendBody) => dapiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(sendBody), signal: AbortSignal.timeout(20_000) }),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, appointmentId: result.appointmentId });
}
