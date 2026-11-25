import { z } from 'zod';

/**
 * Schéma Zod représentant la forme BRUTE du fichier .quiz.yml.
 * `media` (optionnel, sur la question) et `answer` (le format de réponse)
 * sont indépendants.
 */

// --- Options de choix ---

const choiceOptionSchema = z.object({
  text: z.string().min(1, "le texte de l'option ne peut pas être vide"),
  correct: z.boolean().default(false),
});

// --- Les 4 formats de réponse possibles, indépendants de tout média ---

const booleanAnswerSchema = z.object({
  mode: z.literal('boolean'),
  value: z.boolean(),
});

const choiceAnswerSchema = z.object({
  mode: z.literal('choice'),
  multiple: z.boolean().default(false),
  options: z.array(choiceOptionSchema).min(2, 'il faut au moins 2 options'),
});

const textAnswerSchema = z.object({
  mode: z.literal('text'),
  correction: z.enum(['automatic', 'manual']),
  accepted: z.array(z.string().min(1)).optional(),
  fuzzy_matching: z.boolean().optional().default(false),
});

const numberAnswerSchema = z.object({
  mode: z.literal('number'),
  range: z.object({ min: z.number(), max: z.number() }),
  value: z.number(),
  tolerance: z.number().nonnegative(),
});

/**
 * Les règles qui dépendent de plusieurs champs sont regroupées dans un
 * .superRefine() global : z.discriminatedUnion exige des membres ZodObject purs.
 */
export const answerSchema = z
    .discriminatedUnion('mode', [booleanAnswerSchema, choiceAnswerSchema, textAnswerSchema, numberAnswerSchema])
    .superRefine((a, ctx) => {
      if (a.mode === 'choice' && !a.options.some((o) => o.correct)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'au moins une option doit être marquée correct: true',
          path: ['options'],
        });
      }

      if (a.mode === 'text' && a.correction === 'automatic' && (!a.accepted || a.accepted.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "en correction 'automatic', il faut au moins une réponse dans 'accepted'",
          path: ['accepted'],
        });
      }

      if (a.mode === 'number') {
        if (a.range.min >= a.range.max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'range.min doit être strictement inférieur à range.max',
            path: ['range'],
          });
        }
        if (a.value < a.range.min || a.value > a.range.max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'value doit être compris dans range',
            path: ['value'],
          });
        }
      }
    });

// --- Média : image et audio exigent une URL https, youtube aussi, plus clip.start ---

const httpsUrl = z
    .string()
    .url("l'URL du média est invalide")
    .startsWith('https://', "l'URL du média doit commencer par https://");

const mediaSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('image'),
    url: httpsUrl,
  }),
  z.object({
    type: z.literal('audio'),
    url: httpsUrl,
  }),
  z.object({
    type: z.literal('youtube'),
    url: httpsUrl,
    clip: z.object({ start: z.number().int().nonnegative() }).optional(),
  }),
]);

// --- Question : titre + points + time_limit optionnel + média optionnel + réponse ---

export const questionSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'le titre de la question est obligatoire'),
  points: z.number().positive().default(1),
  time_limit: z.number().int().positive().optional(),
  media: mediaSchema.optional(),
  answer: answerSchema,
});

// --- Fichier complet ---

const teamsSchema = z.object({
  enabled: z.boolean().default(false),
});

export const quizFileSchema = z.object({
  quiz: z.object({
    title: z.string().min(1, 'quiz.title est obligatoire'),
    description: z.string().optional(),
  }),
  teams: teamsSchema.optional().default({ enabled: false }),
  questions: z.array(questionSchema).min(1, 'le quiz doit contenir au moins une question'),
});

export type QuizFileInput = z.infer<typeof quizFileSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
export type AnswerInput = z.infer<typeof answerSchema>;