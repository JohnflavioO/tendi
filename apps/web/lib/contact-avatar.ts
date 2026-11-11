import { safeMediaUrl } from './inbox-utils';

/** Foto de perfil do WhatsApp: o link guardado vale por alguns dias (os links do WhatsApp expiram). */
export const AVATAR_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export function avatarIsFresh(checkedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!checkedAt) return false;
  const at = Date.parse(checkedAt);
  return Number.isFinite(at) && now.getTime() - at < AVATAR_TTL_MS;
}

const AVATAR_KEYS = ['url', 'avatar', 'avatarUrl', 'avatar_url', 'picture', 'pictureUrl', 'picture_url', 'profilePictureUrl', 'profile_picture_url', 'imgUrl', 'img_url', 'image', 'imageUrl', 'eurl', 'photo', 'photoUrl'];

/**
 * A resposta de "GET /contacts/{phone}/avatar" da D-API não é documentada em detalhe:
 * procura um link http(s) nos campos mais comuns (também dentro de data/result/avatar).
 */
export function pickAvatarUrl(payload: unknown, depth = 0): string | null {
  if (depth > 3 || payload === null || payload === undefined) return null;
  if (typeof payload === 'string') return safeMediaUrl(payload);
  if (typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  for (const key of AVATAR_KEYS) {
    const value = record[key];
    if (typeof value === 'string') {
      const url = safeMediaUrl(value);
      if (url) return url;
    } else if (value && typeof value === 'object') {
      const nested = pickAvatarUrl(value, depth + 1);
      if (nested) return nested;
    }
  }
  for (const key of ['data', 'result', 'contact', 'profile']) {
    const nested = pickAvatarUrl(record[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}
