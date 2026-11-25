import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseQuizString } from '../../src/quiz-engine/parser/index.js';
import { QuizParseError, QuizYamlSyntaxError } from '../../src/quiz-engine/parser/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../fixtures');

function loadExample(name: string): string {
  return readFileSync(resolve(fixturesDir, name), 'utf-8');
}

const GENDER_REVEAL_IMAGE_URL = 'https://example.com/bebe.jpg';

describe('parseQuizString — cas valide', () => {
  const quiz = parseQuizString(loadExample('gender-reveal.quiz.yml'));

  it('parse le titre', () => {
    expect(quiz.title).toBe('Gender Reveal de Julie & Thomas');
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

  it('parse une question avec média image (url https) + réponse choice (découplage)', () => {
    const q = quiz.questions[2];
    expect(q.media?.type).toBe('image');
    expect(q.media?.url).toBe(GENDER_REVEAL_IMAGE_URL);
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

  it('parse le time_limit en timeLimit', () => {
    expect(quiz.questions[4].timeLimit).toBe(30);
  });

  it('laisse timeLimit indéfini quand il est absent', () => {
    expect(quiz.questions[0].timeLimit).toBeUndefined();
  });

  it('parse une question youtube avec clip.start (sans duration)', () => {
    const q = quiz.questions[5];
    expect(q.media?.type).toBe('youtube');
    expect(q.media?.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(q.media?.clip).toEqual({ start: 35 });
    expect(q.answer.mode).toBe('choice');
  });

  it("accepte une question sans média (media est bien optionnel)", () => {
    expect(quiz.questions[0].media).toBeUndefined();
  });
});

describe('parseQuizString — valeurs par défaut', () => {
  it('génère l\'id et applique points: 1 quand ils sont absents', () => {
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
    expect(q.questions[0].points).toBe(1);
  });
});

describe('parseQuizString — limite de taille', () => {
  it('rejette un fichier de plus de 32 Ko', () => {
    const padding = '# ' + 'x'.repeat(33 * 1024) + '\n';
    const yamlText = padding + `
quiz:
  title: "Trop gros"
questions:
  - title: "Vrai ou faux ?"
    answer:
      mode: boolean
      value: true
`;
    expect(() => parseQuizString(yamlText)).toThrow(QuizParseError);
  });
});

describe('parseQuizString — cas invalides', () => {
  it('rejette une réponse choice sans option correcte', () => {
    const text = loadExample('invalid.quiz.yml');
    try {
      parseQuizString(text);
      expect.fail('aurait dû lever une erreur');
    } catch (err) {
      expect(err).toBeInstanceOf(QuizParseError);
      const parseErr = err as QuizParseError;
      expect(parseErr.issues.some((i) => i.includes('correct: true'))).toBe(true);
      expect(parseErr.issues.some((i) => i.includes("question 'q1'"))).toBe(true);
    }
  });

  it('rejette un range min >= max', () => {
    const text = loadExample('invalid.quiz.yml');
    try {
      parseQuizString(text);
      expect.fail('aurait dû lever une erreur');
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

  it('rejette un média youtube sans url', () => {
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

  it('rejette un média image avec source locale au lieu de url', () => {
    const yamlText = `
quiz:
  title: "Test"
questions:
  - title: "Qui ?"
    media:
      type: image
      source: "./images/bebe.jpg"
    answer:
      mode: boolean
      value: true
`;
    expect(() => parseQuizString(yamlText)).toThrow(QuizParseError);
  });

  it('rejette une url image en http (non https)', () => {
    const yamlText = `
quiz:
  title: "Test"
questions:
  - title: "Qui ?"
    media:
      type: image
      url: "http://example.com/bebe.jpg"
    answer:
      mode: boolean
      value: true
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