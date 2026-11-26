import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadPublicAgenda } from '@/lib/agenda-public-server';

export const dynamic = 'force-dynamic';

type Context = { params: { slug: string } };

/**
 * GET /api/agenda-public/<slug>
 * Dados da tela de agendamento público: nome da empresa, profissionais e serviços ativos.
 * Nada sensível aqui (sem dados de clientes). 404 cobre empresa inexistente, sem acesso, ou
 * com o agendamento público desligado — o visitante não precisa saber a diferença.
 */
export async function GET(_request: Request, { params }: Context) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });
  const agenda = await loadPublicAgenda(admin, params.slug);
  if (!agenda) return NextResponse.json({ error: 'Agendamento não disponível.' }, { status: 404 });
  return NextResponse.json({
    organization: { name: agenda.organization.name, segment: agenda.organization.segment, logoUrl: agenda.organization.logoUrl, address: agenda.organization.address },
    professionals: agenda.professionals,
    services: agenda.services,
  });
}
