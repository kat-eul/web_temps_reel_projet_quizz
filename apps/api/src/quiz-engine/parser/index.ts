import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { quizFileSchema } from './schema.js';
import { normalizeQuiz } from './normalize.js';
import { QuizParseError, QuizYamlSyntaxError, formatZodError } from './errors.js';
import type { Quiz } from '../models/quiz.js';

export { QuizParseError, QuizYamlSyntaxError } from './errors.js';
export * from './schema.js';

/**
 * Pipeline complet : texte YAML → Quiz (modèle interne prêt pour le moteur de jeu).
 *
 * [1] parseYamlText   : texte → objet JS brut
 * [2] validateSchema  : objet brut → objet validé (Zod), erreurs lisibles
 * [3] normalizeQuiz   : objet validé → modèle interne (ids générés, camelCase)
 */
export function parseQuizString(yamlText: string): Quiz {
  const raw = parseYamlText(yamlText);
  const validated = validateSchema(raw);
  return normalizeQuiz(validated);
}

export function parseQuizFile(filePath: string): Quiz {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new QuizParseError([`Impossible de lire le fichier '${filePath}' : ${(err as Error).message}`]);
  }
  return parseQuizString(text);
}

// --- Étape 1 : YAML texte → objet brut ---
function parseYamlText(yamlText: string): unknown {
  try {
    return yaml.load(yamlText);
  } catch (err) {
    const message = err instanceof yaml.YAMLException ? err.message : String(err);
    throw new QuizYamlSyntaxError(message);
  }
}

// --- Étape 2 : objet brut → objet validé (Zod) ---
function validateSchema(raw: unknown) {
  const result = quizFileSchema.safeParse(raw);

  if (!result.success) {
    const rawQuestions = Array.isArray((raw as Record<string, unknown> | null)?.questions)
      ? ((raw as Record<string, unknown>).questions as unknown[])
      : undefined;
    throw new QuizParseError(formatZodError(result.error, rawQuestions));
  }

  return result.data;
}
