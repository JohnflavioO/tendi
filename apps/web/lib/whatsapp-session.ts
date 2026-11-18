import { unwrapDapiResource } from './dapi-resource';

/**
 * A sessão do WhatsApp de cada workspace no provedor compatível com a D-API
 * (On Connect). O código é estável e derivado do workspace, então o Console
 * consegue mostrá-lo antes de existir conexão.
 *
 * Dois tipos de número:
 * - não oficial: WhatsApp Web, conectado pelo próprio cliente com QR Code;
 * - oficial: API da Meta, ligado pela equipe TendiDesk no painel do On Connect
 *   (Conexões › Nova conexão Meta), usando este código de sessão. Não tem QR.
 */

export type WhatsappSessionType = 'official' | 'unofficial';

export function stableSessionId(organizationId: string): string {
  const safeOrganizationId = organizationId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `tendi-${safeOrganizationId}`;
}

/** O código salvo na conexão, ou o que será usado quando ela for criada. */
export function sessionIdFor(organizationId: string, providerAccountId: string | null | undefined): string {
  return providerAccountId && /^[a-z0-9-]+$/.test(providerAccountId) ? providerAccountId : stableSessionId(organizationId);
}

/**
 * O On Connect informa `connectionType: "official"` (e `provider: "meta_cloud"`)
 * nas respostas de sessão e de QR Code. Outros provedores não mandam o campo:
 * aí não há como saber, e a conexão segue como está.
 */
export function readConnectionType(payload: unknown): WhatsappSessionType | null {
  const resource = unwrapDapiResource(payload);
  const root = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const type = resource.connectionType ?? root.connectionType;
  if (type === 'official' || type === 'unofficial') return type;
  const provider = resource.provider ?? root.provider;
  if (provider === 'meta_cloud') return 'official';
  if (provider === 'whatsapp_web') return 'unofficial';
  return null;
}

/** As configurações da conexão para cada tipo, preservando o restante (assinatura, etc.). */
export function settingsForType(
  current: Record<string, unknown> | null | undefined,
  type: WhatsappSessionType,
): Record<string, unknown> {
  return {
    ...(current ?? {}),
    provider: 'd-api',
    session_type: type,
    connection_mode: type === 'official' ? 'meta' : 'qr',
  };
}

export function isOfficial(settings: Record<string, unknown> | null | undefined): boolean {
  return settings?.session_type === 'official';
}
