import { z } from 'zod';

export const onConnectProviderSchema = z.enum([
  'meta_cloud',
  'authorized_partner',
]);

export const onConnectConnectionStatusSchema = z.enum([
  'created',
  'pending_authorization',
  'connecting',
  'connected',
  'disconnected',
  'error',
  'suspended',
]);

export const onConnectConnectionSchema = z.object({
  id: z.string().min(1),
  provider: onConnectProviderSchema,
  status: onConnectConnectionStatusSchema,
  displayName: z.string().min(1),
  phoneNumber: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const onConnectCreateConnectionSchema = z.object({
  provider: onConnectProviderSchema.default('meta_cloud'),
  displayName: z.string().trim().min(1).max(120),
  returnUrl: z.string().url().optional(),
});

export const onConnectCreateConnectionResultSchema = z.object({
  connection: onConnectConnectionSchema,
  authorizationUrl: z.string().url().optional(),
});

export const onConnectSendTextSchema = z.object({
  connectionId: z.string().min(1),
  to: z.string().regex(/^\+?[1-9]\d{7,14}$/),
  text: z.string().trim().min(1).max(4096),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const onConnectMessageResultSchema = z.object({
  id: z.string().min(1),
  connectionId: z.string().min(1),
  status: z.enum(['accepted', 'sent', 'delivered', 'read', 'failed']),
  providerMessageId: z.string().optional(),
  createdAt: z.string().datetime(),
});

export const onConnectWebhookEventSchema = z.object({
  id: z.string().min(1),
  event: z.enum([
    'connection.status',
    'message.received',
    'message.status',
  ]),
  occurredAt: z.string().datetime(),
  organizationReference: z.string().min(1),
  data: z.record(z.unknown()),
});

export type OnConnectProvider = z.infer<typeof onConnectProviderSchema>;
export type OnConnectConnectionStatus = z.infer<typeof onConnectConnectionStatusSchema>;
export type OnConnectConnection = z.infer<typeof onConnectConnectionSchema>;
export type OnConnectCreateConnection = z.infer<typeof onConnectCreateConnectionSchema>;
export type OnConnectCreateConnectionResult = z.infer<typeof onConnectCreateConnectionResultSchema>;
export type OnConnectSendText = z.infer<typeof onConnectSendTextSchema>;
export type OnConnectMessageResult = z.infer<typeof onConnectMessageResultSchema>;
export type OnConnectWebhookEvent = z.infer<typeof onConnectWebhookEventSchema>;
