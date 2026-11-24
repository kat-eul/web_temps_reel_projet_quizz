import type { Question } from '../models/quiz.js';

/**
 * Normalise une chaîne pour une comparaison insensible à la casse et aux
 * accents ("Léa" et "léa" et "Lea" doivent matcher de la même façon).
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents
    .trim()
    .toLowerCase();
}

/**
 * Distance de Levenshtein simple, utilisée uniquement pour la tolérance aux
 * fautes de frappe (fuzzy_matching: true) sur les réponses de type text.
 */
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[rows - 1][cols - 1];
}

/**
 * Tolérance aux fautes de frappe : 1 erreur autorisée jusqu'à 7 caractères,
 * 2 erreurs au-delà.
 */
function fuzzyMatches(input: string, accepted: string): boolean {
  const normInput = normalizeText(input);
  const normAccepted = normalizeText(accepted);
  if (normInput === normAccepted) return true;

  const maxDistance = normAccepted.length > 7 ? 2 : 1;
  return levenshteinDistance(normInput, normAccepted) <= maxDistance;
}

/**
 * Corrige une réponse selon `question.answer.mode` — indépendant de la
 * présence ou non d'un média sur la question. Retourne `null` pour signaler
 * qu'une réponse texte en correction manuelle attend l'animateur.
 */
export function evaluateAnswer(question: Question, value: unknown): boolean | null {
  const answer = question.answer;

  switch (answer.mode) {
    case 'boolean':
      return typeof value === 'boolean' && value === answer.value;

    case 'choice': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const correctOptions = answer.options.filter((o) => o.correct).map((o) => o.text);

      if (answer.multiple) {
        const selectedSet = new Set(selected);
        const correctSet = new Set(correctOptions);
        if (selectedSet.size !== correctSet.size) return false;
        return [...selectedSet].every((s) => correctSet.has(s));
      }
      return selected.length === 1 && correctOptions.includes(selected[0]);
    }

    case 'text': {
      if (answer.correction === 'manual') return null; // jugé par l'animateur
      if (typeof value !== 'string') return false;
      const accepted = answer.accepted ?? [];
      if (answer.fuzzyMatching) {
        return accepted.some((a) => fuzzyMatches(value, a));
      }
      return accepted.some((a) => normalizeText(value) === normalizeText(a));
    }

    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) return false;
      return Math.abs(value - answer.value) <= answer.tolerance;
    }

    default: {
      const _exhaustive: never = answer;
      throw new Error(`Format de réponse non géré par evaluateAnswer: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** true si cette question nécessite une validation manuelle par l'animateur */
export function requiresManualValidation(question: Question): boolean {
  return question.answer.mode === 'text' && question.answer.correction === 'manual';
}
