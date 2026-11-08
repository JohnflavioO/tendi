import { z } from 'zod';
import { contactSchema, sessionSchema, messageSchema, cardSchema } from '@tendi/shared';

const mode = process.env.NEXT_PUBLIC_DATA_MODE ?? 'mock';
const baseUrl = process.env.NEXT_PUBLIC_API_URL;

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  if (mode === 'mock') {
    const response = await fetch(`/api/mock${path}`, init);
    if (!response.ok) throw new Error(`Mock API error: ${response.status}`);
    return schema.parse(await response.json());
  }
  if (!baseUrl) throw new Error('NEXT_PUBLIC_API_URL é obrigatória quando NEXT_PUBLIC_DATA_MODE=api.');
  const response = await fetch(new URL(path, baseUrl), { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return schema.parse(await response.json());
}

export const apiClient = {
  contacts: { list: () => request('/contacts', z.array(contactSchema)) },
  sessions: { list: () => request('/sessions', z.array(sessionSchema)) },
  messages: { list: () => request('/messages', z.array(messageSchema)) },
  cards: { list: () => request('/cards', z.array(cardSchema)) }
};
