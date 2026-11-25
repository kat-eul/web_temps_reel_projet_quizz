import type { ZodError, ZodIssue } from 'zod';

/**
 * Erreur levée par le parser, avec un message pensé pour quelqu'un qui écrit
 * du YAML à la main et ne connaît pas TypeScript/Zod. On évite les stack
 * traces brutes de Zod : on retraduit chaque problème en une phrase claire,
 * si possible en pointant la question concernée.
 */
export class QuizParseError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join('\n'));
    this.name = 'QuizParseError';
    this.issues = issues;
  }
}

export class QuizYamlSyntaxError extends Error {
  constructor(originalMessage: string) {
    super(`Le fichier YAML est mal formé : ${originalMessage}`);
    this.name = 'QuizYamlSyntaxError';
  }
}

/**
 * Transforme les issues Zod en messages lisibles, du type :
 * "question 'q2' (réponse: choice) : il faut au moins 2 options"
 * "quiz.title : quiz.title est obligatoire"
 */
export function formatZodError(error: ZodError, rawQuestions?: unknown[]): string[] {
  return error.issues.map((issue) => formatIssue(issue, rawQuestions));
}

function formatIssue(issue: ZodIssue, rawQuestions?: unknown[]): string {
  const path = issue.path;

  // Cas fréquent : erreur sur une question précise → questions[N]
  if (path[0] === 'questions' && typeof path[1] === 'number') {
    const index = path[1] as number;
    const question = rawQuestions?.[index] as
      | { id?: string; title?: string; answer?: { mode?: string } }
      | undefined;
    const label = question?.id
      ? `question '${question.id}'`
      : `question ${index + 1}`;
    const modeInfo = question?.answer?.mode ? ` (réponse: ${question.answer.mode})` : '';
    const titleInfo = question?.title ? ` — "${question.title}"` : '';
    return `${label}${modeInfo}${titleInfo} : ${issue.message}`;
  }

  const pathStr = path.length > 0 ? path.join('.') : '(racine du fichier)';
  return `${pathStr} : ${issue.message}`;
}
