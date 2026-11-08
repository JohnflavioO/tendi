export type RealtimeEvent = { type: 'message:new'; sessionId: string; body: string; createdAt: string };
export interface RealtimeClient { connect(onEvent: (event: RealtimeEvent) => void): () => void; }

export class MockRealtime implements RealtimeClient {
  connect(onEvent: (event: RealtimeEvent) => void) {
    const timer = setInterval(() => onEvent({ type: 'message:new', sessionId: `session-${1+Math.floor(Math.random()*12)}`, body: 'Nova mensagem recebida (simulação).', createdAt: new Date().toISOString() }), 20_000);
    return () => clearInterval(timer);
  }
}

export class SocketRealtime implements RealtimeClient {
  connect(_onEvent: (event: RealtimeEvent) => void): () => void {
    // Socket.IO é carregado somente quando a API estiver disponível, nunca nas rotas da Vercel.
    throw new Error('SocketRealtime será habilitado na integração com a API.');
  }
}

export function createRealtimeClient(): RealtimeClient {
  return (process.env.NEXT_PUBLIC_DATA_MODE ?? 'mock') === 'mock' ? new MockRealtime() : new SocketRealtime();
}
