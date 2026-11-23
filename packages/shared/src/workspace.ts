import { z } from 'zod';

export const switchWorkspaceSchema = z.object({
  organizationId: z.string().uuid(),
  returnTo: z.string().regex(/^\/(?!\/)/).max(300).default('/inbox'),
});

export const sendInboxMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export type SwitchWorkspaceInput = z.infer<typeof switchWorkspaceSchema>;
export type SendInboxMessageInput = z.infer<typeof sendInboxMessageSchema>;
