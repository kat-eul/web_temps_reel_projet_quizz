import { z } from 'zod';

export const RoomSchema = z.object({
  id: z.number(),
  name: z.string().trim().min(3).max(50),
  nbParticipants: z.number().int().min(2).max(50),
  quizId: z.number().int().positive(),
  createdAt: z.string().optional(),
});

export const CreateRoomSchema = z.object({
  name: z.string().trim().min(3).max(50),
  nbParticipants: z.coerce.number().int().min(2).max(50),
  quizId: z.coerce.number().int().positive(),
});

export type Room = z.infer<typeof RoomSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;