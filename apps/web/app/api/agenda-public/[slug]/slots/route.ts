import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadPublicAgenda, listPublicSlots } from '@/lib/agenda-public-server';

export const dynamic = 'force-dynamic';

type Context = { params: { slug: string } };

/**
 * GET /api/agenda-public/<slug>/slots?professionalId=&serviceId=&day=AAAA-MM-DD
 * Horários livres (minutos do dia, hora local da empresa) para o cliente escolher.
 */
export async function GET(request: Request, { params }: Context) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });
  const agenda = await loadPublicAgenda(admin, params.slug);
  if (!agenda) return NextResponse.json({ error: 'Agendamento não disponível.' }, { status: 404 });

  const url = new URL(request.url);
  const professionalId = url.searchParams.get('professionalId') ?? '';
  const serviceId = url.searchParams.get('serviceId') ?? '';
  const day = url.searchParams.get('day') ?? '';
  const professional = agenda.professionals.find(item => item.id === professionalId);
  const service = agenda.services.find(item => item.id === serviceId);
  if (!professional || !service || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
  }

  const slots = await listPublicSlots(admin, agenda.organization, { professionalId, durationMinutes: service.durationMinutes, day });
  return NextResponse.json({ slots });
}
