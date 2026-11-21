import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/team-route';

export const dynamic = 'force-dynamic';

/** Claim is authorized and serialized in PostgreSQL; never use service-role here. */
export async function POST(request: Request) {
 const db = (await createClient()) as any;
 const { data: auth, error: authError } = await db.auth.getUser();
 if (authError || !auth?.user) return NextResponse.json({ error: 'Faça login.' }, { status: 401 });
 const body = await request.json().catch(() => null);
 if (!isUuid(body?.organizationId) || !isUuid(body?.contactId)) {
   return NextResponse.json({ error: 'Empresa ou contato inválido.' }, { status: 400 });
 }
 const { data, error } = await db.rpc('claim_sales_portfolio', {
   p_organization_id: body.organizationId,
   p_contact_id: body.contactId,
 });
 if (error) {
   const status = error.code === '23505' ? 409
     : error.code === '42501' ? 403
     : error.code === 'P0002' ? 404
     : error.code === '22023' ? 422 : 500;
   return NextResponse.json({
     error: status === 409 ? 'Este contato já foi assumido por outra pessoa. Atualize a lista.'
       : status === 500 ? 'Não foi possível assumir o contato.' : error.message,
   }, { status });
 }
 return NextResponse.json({ ok: true, claimId: data });
}
