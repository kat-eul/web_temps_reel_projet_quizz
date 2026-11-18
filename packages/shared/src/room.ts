import { z } from 'zod';

export const RoomStateSchema = z.enum(['WAITING', 'IN_PROGRESS', 'FINISHED']);

export const RoomSchema = z.object({
  id: z.number(),
  name: z.string().trim().min(3).max(50),
  nbMaxParticipants: z.number().int().min(2).max(50),
  nbParticipants: z.number().int().min(0),
  quizId: z.number().int().positive(),
  ownerId: z.number().int().positive(),
  state: RoomStateSchema,
  currentQuestionId: z.number().int().positive().nullable(),
  questionStartedAt: z.string().nullable(),
  questionEndsAt: z.string().nullable(),
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

export const RoomStartSchema = z.object({
  roomId: z.coerce.number().int().positive(),
});

export const GameQuestionSchema = z.object({
  id: z.number().int().positive(),
  question: z.string(),
  answers: z.array(z.object({
    id: z.number().int().positive(),
    enonce: z.string(),
  })),
});

export const RoomStartedSchema = z.object({
  roomId: z.number().int().positive(),
  state: z.literal('IN_PROGRESS'),
  question: GameQuestionSchema,
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