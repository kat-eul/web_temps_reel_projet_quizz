import { z } from 'zod';

export const QuizSchema = z.object({
  id: z.number(),
  title: z.string(),
  createur: z.string(),
});

export type Quiz = z.infer<typeof QuizSchema>;

