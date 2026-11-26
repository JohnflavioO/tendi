import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dapiRequest } from '@/lib/dapi';
import { notifyAppointmentChange, type NotifyAction } from '@/lib/agenda-notify-server';

export const dynamic = 'force-dynamic';

type Context = { params: { id: string } };

/**
 * POST /api/agenda/appointments/<id>/notify  { action: "cancelled" | "rescheduled" }
 * Dispara um aviso por WhatsApp quando a equipe cancela ou remarca um agendamento direto no
 * painel. O acesso ao agendamento é checado com o cliente da sessão (regras do banco); o envio
 * em si usa a chave de serviço, como os lembretes automáticos.
 */
export async function POST(request: Request, { params }: Context) {
  const supabase = (await createClient()) as any;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const action = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).action : null;
  if (action !== 'cancelled' && action !== 'rescheduled') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

  // As regras do banco só devolvem o agendamento se a pessoa pertence à empresa dele.
  const { data: appointment } = await supabase
    .from('appointments')
    .select('id,organization_id,professional_id,contact_id,conversation_id,customer_name,customer_phone,starts_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!appointment) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });

  const [professionalResult, orgResult] = await Promise.all([
    supabase.from('agenda_professionals').select('name').eq('id', appointment.professional_id).maybeSingle(),
    supabase.from('organizations').select('name,timezone').eq('id', appointment.organization_id).maybeSingle(),
  ]);
  const professionalName = (professionalResult.data as { name?: string } | null)?.name ?? 'nossa equipe';
  const org = orgResult.data as { name?: string; timezone?: string } | null;

  const result = await notifyAppointmentChange(admin, {
    appointmentId: appointment.id,
    organizationId: appointment.organization_id,
    organizationName: org?.name ?? '',
    timeZone: org?.timezone || 'America/Sao_Paulo',
    professionalName,
    customerName: appointment.customer_name,
    customerPhone: appointment.customer_phone,
    contactId: appointment.contact_id,
    conversationId: appointment.conversation_id,
    startsAt: appointment.starts_at,
    action: action as NotifyAction,
  }, (path, reqBody) => dapiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(reqBody), signal: AbortSignal.timeout(20_000) }));

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true });
}
