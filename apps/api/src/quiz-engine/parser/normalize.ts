import type { QuizFileInput, QuestionInput, AnswerInput } from './schema.js';
import type { Quiz, Question, AnswerSpec, MediaRef } from '../models/quiz.js';

/**
 * Transforme la sortie validée par Zod (snake_case, ids optionnels) en
 * modèle interne (camelCase, ids garantis). Seule fonction du projet
 * autorisée à générer un id de question à partir de son index.
 */
export function normalizeQuiz(input: QuizFileInput): Quiz {
  return {
    title: input.quiz.title,
    description: input.quiz.description,
    teamsEnabled: input.teams?.enabled ?? false,
    questions: input.questions.map((q, index) => normalizeQuestion(q, index)),
  };
}

function generateId(index: number): string {
  return `q${index + 1}`;
}

function normalizeQuestion(q: QuestionInput, index: number): Question {
  return {
    id: q.id ?? generateId(index),
    title: q.title,
    points: q.points,
    timeLimit: q.time_limit,
    media: normalizeMedia(q.media),
    answer: normalizeAnswer(q.answer),
  };
}

function normalizeAnswer(a: AnswerInput): AnswerSpec {
  switch (a.mode) {
    case 'boolean':
      return { mode: 'boolean', value: a.value };

    case 'choice':
      return { mode: 'choice', multiple: a.multiple, options: a.options };

    case 'text':
      return {
        mode: 'text',
        correction: a.correction,
        accepted: a.accepted,
        fuzzyMatching: a.fuzzy_matching,
      };

    case 'number':
      return { mode: 'number', range: a.range, value: a.value, tolerance: a.tolerance };

    default: {
      const _exhaustive: never = a;
      throw new Error(`Format de réponse non géré par le normalizer: ${JSON.stringify(_exhaustive)}`);
    }
  }
}


function normalizeMedia(m: QuestionInput['media']): MediaRef | undefined {
  if (!m) return undefined;
  return {
    type: m.type,
    url: m.url,
    clip: m.type === 'youtube' && m.clip ? { start: m.clip.start } : undefined,
  };
}
