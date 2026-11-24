import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseQuizString } from '../src/parser/index.js';
import { QuizParseError, QuizYamlSyntaxError } from '../src/parser/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(__dirname, '../../../examples');

function loadExample(name: string): string {
  return readFileSync(resolve(examplesDir, name), 'utf-8');
}

describe('parseQuizString — cas valide', () => {
  const quiz = parseQuizString(loadExample('gender-reveal.quiz.yml'));

  it('parse le titre et les settings', () => {
    expect(quiz.title).toBe('Gender Reveal de Julie & Thomas');
    expect(quiz.settings.mode).toBe('individual');
    expect(quiz.settings.maxPlayers).toBe(10);
  });

  it('parse les 6 questions avec leurs ids', () => {
    expect(quiz.questions).toHaveLength(6);
    expect(quiz.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
  });

  it('parse correctement une réponse boolean', () => {
    const q = quiz.questions[0];
    expect(q.answer.mode).toBe('boolean');
    if (q.answer.mode === 'boolean') expect(q.answer.value).toBe(true);
  });

  it('parse correctement une réponse choice multiple', () => {
    const q = quiz.questions[1];
    expect(q.answer.mode).toBe('choice');
    if (q.answer.mode === 'choice') {
      expect(q.answer.multiple).toBe(true);
      expect(q.answer.options.filter((o) => o.correct)).toHaveLength(2);
    }
  });

  it('parse une question avec média image + réponse choice (découplage)', () => {
    const q = quiz.questions[2];
    expect(q.media?.type).toBe('image');
    expect(q.media?.source).toBe('./images/bebe.jpg');
    expect(q.answer.mode).toBe('choice');
    if (q.answer.mode === 'choice') {
      expect(q.answer.multiple).toBe(false);
      expect(q.answer.options.find((o) => o.correct)?.text).toBe('Papa');
    }
  });

  it('parse correctement une réponse text avec fuzzy matching (camelCase)', () => {
    const q = quiz.questions[3];
    expect(q.answer.mode).toBe('text');
    if (q.answer.mode === 'text') {
      expect(q.answer.fuzzyMatching).toBe(true);
      expect(q.answer.accepted).toContain('Léa');
    }
  });

  it('parse une question avec média youtube + réponse choice', () => {
    const q = quiz.questions[5];
    expect(q.media?.type).toBe('youtube');
    expect(q.media?.url).toBe('https://youtube.com/xxxxx');
    expect(q.answer.mode).toBe('choice');
  });

  it('applique les valeurs par défaut (id généré si absent)', () => {
    const yamlText = `
quiz:
  title: "Sans id"
questions:
  - title: "Vrai ou faux ?"
    answer:
      mode: boolean
      value: true
`;
    const q = parseQuizString(yamlText);
    expect(q.questions[0].id).toBe('q1');
    expect(q.questions[0].points).toBe(1); // valeur par défaut
    expect(q.settings.maxPlayers).toBe(20); // valeur par défaut
  });

  it("accepte une question sans média (media est bien optionnel)", () => {
    const q = quiz.questions[0];
    expect(q.media).toBeUndefined();
  });
});

describe('parseQuizString — cas invalides', () => {
  it('rejette une réponse choice sans option correcte', () => {
    expect(() => parseQuizString(loadExample('invalid.quiz.yml'))).toThrow(QuizParseError);

    try {
      parseQuizString(loadExample('invalid.quiz.yml'));
    } catch (err) {
      const parseErr = err as QuizParseError;
      expect(parseErr.issues.some((i) => i.includes('correct: true'))).toBe(true);
      expect(parseErr.issues.some((i) => i.includes("question 'q1'"))).toBe(true);
    }
  });

  it('rejette un range min >= max', () => {
    try {
      parseQuizString(loadExample('invalid.quiz.yml'));
    } catch (err) {
      const parseErr = err as QuizParseError;
      expect(parseErr.issues.some((i) => i.includes("question 'q2'"))).toBe(true);
    }
  });

  it('rejette un quiz sans titre', () => {
    const yamlText = `
quiz: {}
questions:
  - title: "Test"
    answer:
      mode: boolean
      value: true
`;
    expect(() => parseQuizString(yamlText)).toThrow(QuizParseError);
  });

  it('rejette un quiz sans question', () => {
    const yamlText = `
quiz:
  title: "Vide"
questions: []
`;
    expect(() => parseQuizString(yamlText)).toThrow(QuizParseError);
  });

  it('rejette un YAML syntaxiquement invalide', () => {
    const brokenYaml = `
quiz:
  title: "Oups
questions: [
`;
    expect(() => parseQuizString(brokenYaml)).toThrow(QuizYamlSyntaxError);
  });

  it("rejette un média youtube sans url", () => {
    const yamlText = `
quiz:
  title: "Test"
questions:
  - title: "Chanson ?"
    media:
      type: youtube
    answer:
      mode: text
      correction: automatic
      accepted: ["Test"]
`;
    expect(() => parseQuizString(yamlText)).toThrow(QuizParseError);
  });

  it("rejette une réponse text en mode automatic sans 'accepted'", () => {
    const yamlText = `
quiz:
  title: "Test"
questions:
  - title: "Prénom ?"
    answer:
      mode: text
      correction: automatic
`;
    expect(() => parseQuizString(yamlText)).toThrow(QuizParseError);
  });
});
