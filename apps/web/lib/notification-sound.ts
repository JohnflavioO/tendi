'use client';

/**
 * Som de notificação (Inbox, central de notificações). Gerado na hora com a Web Audio API —
 * sem depender de nenhum arquivo de áudio. Liga/desliga fica salvo no navegador (preferência
 * por aparelho, não por conta: cada pessoa decide se quer som na própria máquina).
 */

const STORAGE_KEY = 'tendi:notification-sound-enabled';

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

function localStore(): Store | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function isSoundEnabled(store: Store | null = localStore()): boolean {
  return store?.getItem(STORAGE_KEY) !== 'off';
}

export function setSoundEnabled(enabled: boolean, store: Store | null = localStore()): void {
  try { store?.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* modo privado ou localStorage bloqueado: ignora */ }
}

/** Toque curto de duas notas (tipo "ding"). Falha em silêncio se o navegador recusar. */
export function playNotificationSound(): void {
  if (typeof window === 'undefined' || !isSoundEnabled()) return;
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const tone = (frequency: number, start: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime + start);
      oscillator.stop(ctx.currentTime + start + duration + 0.02);
    };
    tone(880, 0, 0.12);
    tone(1175, 0.1, 0.18);
    setTimeout(() => void ctx.close(), 600);
  } catch { /* áudio bloqueado (navegador exige interação prévia, etc.): ignora */ }
}
