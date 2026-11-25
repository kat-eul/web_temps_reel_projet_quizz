import { z } from 'zod';

export const RoomStateSchema = z.enum(['WAITING', 'IN_PROGRESS', 'FINISHED']);

export const RoomSchema = z.object({
  id: z.number(),
  name: z.string().trim().min(3).max(50),
  nbMaxParticipants: z.number().int().min(2).max(50),
  nbParticipants: z.number().int().min(0),
  ownerId: z.number().int().positive(),
  state: RoomStateSchema,
  createdAt: z.string().optional(),
});

export const CreateRoomSchema = z.object({
  name: z.string().trim().min(3).max(50),
  nbMaxParticipants: z.coerce.number().int().min(2).max(50),
  quizYaml: z.string().min(1, 'le quiz est obligatoire').max(32 * 1024, 'le quiz dépasse 32 Ko'),
});

export const RoomMembershipSchema = z.object({
  roomId: z.coerce.number().int().positive(),
});

export const RoomStartSchema = z.object({
  roomId: z.coerce.number().int().positive(),
});


export const RoomStartedSchema = z.object({
  roomId: z.number().int().positive(),
  state: z.literal('IN_PROGRESS'),
  questionStartedAt: z.string(),
  questionEndsAt: z.string(),
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
export type RoomState = z.infer<typeof RoomStateSchema>;
export type RoomStartInput = z.infer<typeof RoomStartSchema>;
export type RoomStarted = z.infer<typeof RoomStartedSchema>;