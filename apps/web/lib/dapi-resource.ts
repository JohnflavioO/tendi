/**
 * D-API endpoints may return the resource directly or inside a data/session envelope.
 * Função pura, sem variáveis de ambiente: pode ser usada também no navegador.
 */
export function unwrapDapiResource(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const root = payload as Record<string, unknown>;
  const candidate = root.data ?? root.session ?? root.result;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }
  return root;
}
