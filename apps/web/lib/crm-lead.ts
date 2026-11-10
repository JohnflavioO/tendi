import type { SupabaseClient } from '@supabase/supabase-js';

type Db = SupabaseClient<any, any, any>;

export type LeadResult = { created: boolean; reason?: 'already_has_opportunity' | 'no_pipeline' | 'no_open_stage' };

/**
 * Cria uma oportunidade na primeira etapa aberta do funil padrão da empresa
 * (ex.: "Novo lead"), a menos que o contato já tenha alguma oportunidade.
 * Usada pelo webhook quando chega a primeira mensagem de um número novo.
 */
export async function ensureLeadForContact(
  db: Db,
  input: { organizationId: string; contactId: string; title: string },
): Promise<LeadResult> {
  const existing = await db
    .from('opportunities')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('contact_id', input.contactId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(`opportunities.exists: ${existing.error.message}`);
  if (existing.data) return { created: false, reason: 'already_has_opportunity' };

  const pipeline = await db
    .from('crm_pipelines')
    .select('id')
    .eq('organization_id', input.organizationId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pipeline.error) throw new Error(`crm_pipelines.select: ${pipeline.error.message}`);
  if (!pipeline.data) return { created: false, reason: 'no_pipeline' };

  const stage = await db
    .from('crm_stages')
    .select('id')
    .eq('pipeline_id', (pipeline.data as { id: string }).id)
    .eq('final_type', 'open')
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (stage.error) throw new Error(`crm_stages.select: ${stage.error.message}`);
  if (!stage.data) return { created: false, reason: 'no_open_stage' };

  const inserted = await db.from('opportunities').insert({
    organization_id: input.organizationId,
    pipeline_id: (pipeline.data as { id: string }).id,
    stage_id: (stage.data as { id: string }).id,
    contact_id: input.contactId,
    title: input.title.slice(0, 160),
    description: 'Criada automaticamente a partir de uma nova conversa no WhatsApp.',
  });
  if (inserted.error) throw new Error(`opportunities.insert: ${inserted.error.message}`);
  return { created: true };
}
