import { z } from 'zod';

export const roleSchema = z.enum(['owner', 'admin', 'supervisor', 'agent']);
export const sessionStatusSchema = z.enum(['new', 'waiting', 'in_progress', 'completed']);
export const messageDirectionSchema = z.enum(['inbound', 'outbound', 'internal']);
export const contactSchema = z.object({ id: z.string(), companyId: z.string(), name: z.string(), phone: z.string(), email: z.string().email().optional(), tags: z.array(z.string()).default([]), optIn: z.boolean(), ownerId: z.string().optional(), lastSeenAt: z.string().optional() });
export const messageSchema = z.object({ id: z.string(), sessionId: z.string(), wamid: z.string().optional(), direction: messageDirectionSchema, type: z.enum(['text','image','audio','document','video','location','interactive']), body: z.string(), createdAt: z.string(), status: z.enum(['sent','delivered','read','failed']).optional(), author: z.string() });
export const sessionSchema = z.object({ id: z.string(), companyId: z.string(), contactId: z.string(), assignedTo: z.string().optional(), queueId: z.string(), status: sessionStatusSchema, createdAt: z.string(), lastMessageAt: z.string(), firstResponseAt: z.string().optional(), unread: z.number().int().nonnegative().default(0), channel: z.enum(['whatsapp','instagram','messenger']).default('whatsapp') });
export const stageSchema = z.object({ id: z.string(), name: z.string(), color: z.string(), order: z.number().int(), finalType: z.enum(['open','won','lost']).default('open') });
export const cardSchema = z.object({ id: z.string(), title: z.string(), contactId: z.string(), stageId: z.string(), ownerId: z.string(), value: z.number().nonnegative(), updatedAt: z.string(), tags: z.array(z.string()).default([]) });
export type Role = z.infer<typeof roleSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type CrmCard = z.infer<typeof cardSchema>;

export * from './workspace';
