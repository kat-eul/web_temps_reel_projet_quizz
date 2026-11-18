import { z } from 'zod';

export const ChatHistorySchema = z.object({
  roomId: z.coerce.number().int().positive(),
});

export const SendChatMessageSchema = z.object({
  roomId: z.coerce.number().int().positive(),
  content: z.string().trim().min(1).max(500),
});

export const ChatMessageSchema = z.object({
  id: z.number().int().positive(),
  roomId: z.number().int().positive(),
  senderId: z.number().int().positive(),
  senderPseudo: z.string(),
  content: z.string(),
  createdAt: z.string(),
});

export type ChatHistoryInput = z.infer<typeof ChatHistorySchema>;
export type SendChatMessageInput = z.infer<typeof SendChatMessageSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
