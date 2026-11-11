import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { isAiProvider, resolveProviderKey } from '@/lib/ai-keys';
import { friendlyAiError, generateReply } from '@/lib/ai-llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/admin/ai/test  { provider, model }
 * Faz uma chamada mínima ao provedor com a chave configurada para o Super Admin confirmar
 * que chave e modelo funcionam antes de ligar o agente para os clientes.
 */
export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = body?.provider;
  const model = typeof body?.model === 'string' ? body.model.trim() : '';
  if (!isAiProvider(provider)) return NextResponse.json({ ok: false, error: 'Provedor inválido.' }, { status: 400 });
  if (!model) return NextResponse.json({ ok: false, error: 'Informe o modelo antes de testar.' }, { status: 400 });

  const apiKey = await resolveProviderKey(auth.admin, provider);
  if (!apiKey) return NextResponse.json({ ok: false, error: 'Nenhuma chave configurada para este provedor.' }, { status: 400 });

  const started = Date.now();
  try {
    const result = await generateReply({
      provider,
      model,
      apiKey,
      system: 'Você é um assistente de teste. Responda apenas com a palavra OK.',
      messages: [{ role: 'user', content: 'Teste de conexão.' }],
      timeoutMs: 20_000,
    });
    return NextResponse.json({ ok: true, reply: result.text.slice(0, 80), latencyMs: Date.now() - started });
  } catch (error) {
    return NextResponse.json({ ok: false, error: friendlyAiError(error) }, { status: 200 });
  }
}
