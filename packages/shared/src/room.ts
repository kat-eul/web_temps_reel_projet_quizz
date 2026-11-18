import { z } from 'zod';

export const RoomSchema = z.object({
  id: z.number(),
  name: z.string().trim().min(3).max(50),
  nbMaxParticipants: z.number().int().min(2).max(50),
  nbParticipants: z.number().int().min(0),
  quizId: z.number().int().positive(),
  createdAt: z.string().optional(),
});

export const CreateRoomSchema = z.object({
  name: z.string().trim().min(3).max(50),
  nbMaxParticipants: z.coerce.number().int().min(2).max(50),
  quizId: z.coerce.number().int().positive(),
});

export const RoomMembershipSchema = z.object({
  roomId: z.coerce.number().int().positive(),
});

export const RoomPollSchema = z.object({
  version: z.coerce.number().int().min(0),
});

export const RoomPollResponseSchema = z.object({
  rooms: z.array(RoomSchema),
  version: z.number().int().min(0),
  changed: z.boolean(),
});

export type Room = z.infer<typeof RoomSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type RoomPollInput = z.infer<typeof RoomPollSchema>;
export type RoomPollResponse = z.infer<typeof RoomPollResponseSchema>;