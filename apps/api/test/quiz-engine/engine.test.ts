import { describe, it, expect, beforeEach } from 'vitest';
import type { Quiz } from '../../src/quiz-engine/models/quiz.js';
import { GameEngine, GameEngineError } from '../../src/quiz-engine/engine/index.js';

const MAX_PLAYERS = 3;

function buildQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    title: 'Quiz de test',
    teamsEnabled: false,
    questions: [
      { id: 'q1', title: 'Vrai ou faux ?', points: 1, answer: { mode: 'boolean', value: true } },
      {
        id: 'q2',
        title: 'Choix multiple',
        points: 2,
        answer: {
          mode: 'choice',
          multiple: true,
          options: [
            { text: 'Emma', correct: true },
            { text: 'Louise', correct: true },
            { text: 'Alice', correct: false },
          ],
        },
      },
      {
        id: 'q3',
        title: 'Prénom (manuel)',
        points: 3,
        answer: { mode: 'text', correction: 'manual' },
      },
    ],
    ...overrides,
  };
}

function createEngine(overrides: Partial<Quiz> = {}): GameEngine {
  return new GameEngine(buildQuiz(overrides), MAX_PLAYERS);
}

describe('GameEngine — cycle de vie et scoring de base', () => {
  let engine: GameEngine;
  let alice: ReturnType<GameEngine['addPlayer']>;

  beforeEach(() => {
    engine = createEngine();
    alice = engine.addPlayer(1, 'Alice');
  });

  it("démarre en lobby et n'accepte pas les réponses avant startGame", () => {
    expect(engine.getSnapshot().state).toBe('lobby');
    const result = engine.submitAnswer(alice.id, true);
    expect(result.accepted).toBe(false);
  });

  it('refuse de dépasser la limite de joueurs passée au constructeur', () => {
    engine.addPlayer(2, 'Bob');
    engine.addPlayer(3, 'Charlie');
    expect(() => engine.addPlayer(4, 'Dave')).toThrow(GameEngineError);
  });

  it('score correctement une réponse boolean', () => {
    engine.startGame();
    const result = engine.submitAnswer(alice.id, true);
    expect(result.isCorrect).toBe(true);
    expect(engine.getLeaderboard()[0].score).toBe(1);
  });

  it('refuse une double réponse du même joueur', () => {
    engine.startGame();
    engine.submitAnswer(alice.id, true);
    const second = engine.submitAnswer(alice.id, false);
    expect(second.accepted).toBe(false);
  });

  it('respecte le cycle question_active → question_locked → correction → question suivante', () => {
    engine.startGame();
    engine.submitAnswer(alice.id, true);
    engine.lockCurrentQuestion();
    expect(engine.getSnapshot().state).toBe('question_locked');

    const bob = engine.addPlayer(2, 'Bob');
    expect(engine.submitAnswer(bob.id, true).accepted).toBe(false);

    engine.enterCorrection();
    expect(engine.getSnapshot().state).toBe('correction');

    engine.nextQuestion();
    expect(engine.getSnapshot().state).toBe('question_active');
    expect(engine.getSnapshot().currentQuestionIndex).toBe(1);
  });

  it('termine la partie après la dernière question', () => {
    engine.startGame();
    for (let i = 0; i < 3; i++) {
      engine.lockCurrentQuestion();
      engine.enterCorrection();
      if (i < 2) engine.nextQuestion();
    }
    engine.nextQuestion();
    expect(engine.getSnapshot().state).toBe('finished');
  });

  it('expose les métadonnées du quiz dans le snapshot', () => {
    const snapshot = engine.getSnapshot();
    expect(snapshot.quizTitle).toBe('Quiz de test');
    expect(snapshot.totalQuestions).toBe(3);
    expect(snapshot.teamsEnabled).toBe(false);
  });
});

describe('GameEngine — choix multiple', () => {
  it("valide uniquement si l'ensemble sélectionné correspond exactement aux bonnes réponses", () => {
    const engine = createEngine();
    const alice = engine.addPlayer(1, 'Alice');
    engine.startGame();
    engine.lockCurrentQuestion();
    engine.enterCorrection();
    engine.nextQuestion(); // → q2

    const partial = engine.submitAnswer(alice.id, ['Emma']);
    expect(partial.isCorrect).toBe(false);
  });

  it('accepte quand toutes les bonnes options sont cochées et aucune mauvaise', () => {
    const engine = createEngine();
    const alice = engine.addPlayer(1, 'Alice');
    engine.startGame();
    engine.lockCurrentQuestion();
    engine.enterCorrection();
    engine.nextQuestion(); // → q2

    const result = engine.submitAnswer(alice.id, ['Emma', 'Louise']);
    expect(result.isCorrect).toBe(true);
    expect(engine.getLeaderboard()[0].score).toBe(2);
  });
});

describe('GameEngine — validation manuelle (text)', () => {
  function toQuestion3(engine: GameEngine) {
    engine.startGame();
    engine.lockCurrentQuestion();
    engine.enterCorrection();
    engine.nextQuestion(); // q2
    engine.lockCurrentQuestion();
    engine.enterCorrection();
    engine.nextQuestion(); // q3 (text manuel)
  }

  it("n'attribue aucun point tant que l'animateur n'a pas validé", () => {
    const engine = createEngine();
    const alice = engine.addPlayer(1, 'Alice');
    toQuestion3(engine);

    const result = engine.submitAnswer(alice.id, 'Léa');
    expect(result.isCorrect).toBeUndefined();
    expect(engine.getLeaderboard()[0].score).toBe(0);
  });

  it("empêche de passer à la suite tant qu'une réponse manuelle est en attente", () => {
    const engine = createEngine();
    const alice = engine.addPlayer(1, 'Alice');
    toQuestion3(engine);
    engine.submitAnswer(alice.id, 'Léa');
    engine.lockCurrentQuestion();
    engine.enterCorrection();

    expect(() => engine.nextQuestion()).toThrow(GameEngineError);
  });

  it("valide individuellement chaque joueur et ajuste le score si l'animateur change d'avis", () => {
    const engine = createEngine();
    const alice = engine.addPlayer(1, 'Alice');
    toQuestion3(engine);
    engine.submitAnswer(alice.id, 'Léa');
    engine.lockCurrentQuestion();
    engine.enterCorrection();

    engine.validateManualAnswer(alice.id, true);
    expect(engine.getLeaderboard()[0].score).toBe(3);

    engine.validateManualAnswer(alice.id, false);
    expect(engine.getLeaderboard()[0].score).toBe(0);
  });
});

describe('GameEngine — joueur qui rejoint en retard', () => {
  it('est accepté avec un score de départ à 0', () => {
    const engine = createEngine();
    const alice = engine.addPlayer(1, 'Alice');
    engine.startGame();
    engine.submitAnswer(alice.id, true);

    const bob = engine.addPlayer(2, 'Bob');
    expect(bob.score).toBe(0);
    expect(engine.getSnapshot().players).toHaveLength(2);
  });
});

describe('GameEngine — équipes', () => {
  it('cumule les points au niveau équipe quand un joueur marque', () => {
    const engine = createEngine({ teamsEnabled: true });
    const teamA = engine.addTeam('Équipe A');
    const alice = engine.addPlayer(1, 'Alice', teamA.id);
    engine.startGame();
    engine.submitAnswer(alice.id, true);

    expect(engine.getTeamLeaderboard()[0].score).toBe(1);
  });
});

describe('GameEngine — découplage média/réponse', () => {
  it('accepte une question avec un média image et une réponse de type choice', () => {
    const engine = new GameEngine(
        buildQuiz({
          questions: [
            {
              id: 'q1',
              title: 'Qui est ce bébé ?',
              points: 2,
              media: { type: 'image', url: 'https://example.com/bebe.jpg' },
              answer: {
                mode: 'choice',
                multiple: false,
                options: [
                  { text: 'Papa', correct: true },
                  { text: 'Maman', correct: false },
                ],
              },
            },
          ],
        }),
        MAX_PLAYERS,
    );
    const alice = engine.addPlayer(1, 'Alice');
    engine.startGame();

    const result = engine.submitAnswer(alice.id, ['Papa']);
    expect(result.isCorrect).toBe(true);
  });
});

describe('GameEngine — snapshot et clôture', () => {
  it('masque les réponses des questions choice et text automatique pendant question_active', () => {
    const quiz = buildQuiz({
      questions: [
        {
          id: 'choice',
          title: 'Choix',
          points: 1,
          answer: {
            mode: 'choice',
            multiple: false,
            options: [
              { text: 'Bonne réponse', correct: true },
              { text: 'Mauvaise réponse', correct: false },
            ],
          },
        },
        {
          id: 'text',
          title: 'Réponse texte',
          points: 1,
          answer: { mode: 'text', correction: 'automatic', accepted: ['Réponse secrète'] },
        },
      ],
    });
    const engine = new GameEngine(quiz, MAX_PLAYERS);

    engine.startGame();
    const choiceSnapshot = engine.getSnapshot();
    expect(choiceSnapshot.state).toBe('question_active');
    expect(choiceSnapshot.currentQuestion?.answer).toMatchObject({
      mode: 'choice',
      options: [
        { text: 'Bonne réponse', correct: false },
        { text: 'Mauvaise réponse', correct: false },
      ],
    });
    expect(JSON.stringify(choiceSnapshot)).not.toContain('"correct":true');
    expect(JSON.stringify(choiceSnapshot)).not.toContain('"accepted"');

    engine.lockCurrentQuestion();
    engine.enterCorrection();
    engine.nextQuestion();

    const textSnapshot = engine.getSnapshot();
    expect(textSnapshot.state).toBe('question_active');
    expect(textSnapshot.currentQuestion?.answer).toMatchObject({
      mode: 'text',
      correction: 'automatic',
    });
    expect((textSnapshot.currentQuestion?.answer as { accepted?: string[] }).accepted).toBeUndefined();
    expect(JSON.stringify(textSnapshot)).not.toContain('"correct":true');
    expect(JSON.stringify(textSnapshot)).not.toContain('"accepted"');
    expect(quiz.questions[0].answer).toMatchObject({
      mode: 'choice',
      options: [
        { text: 'Bonne réponse', correct: true },
        { text: 'Mauvaise réponse', correct: false },
      ],
    });
    expect(quiz.questions[1].answer).toMatchObject({
      mode: 'text',
      accepted: ['Réponse secrète'],
    });
  });

  it('marque faux les réponses manuelles en attente à la clôture sans changer le score', () => {
    const engine = createEngine({
      questions: [{ id: 'manual', title: 'Réponse manuelle', points: 3, answer: { mode: 'text', correction: 'manual' } }],
    });
    const alice = engine.addPlayer(1, 'Alice');
    engine.startGame();
    engine.submitAnswer(alice.id, 'Réponse');

    expect(engine.getLeaderboard()[0].score).toBe(0);
    engine.closeOnExpiry();

    expect(engine.getSnapshot().state).toBe('finished');
    expect(engine.getSnapshot().currentQuestionAnswers[0].isCorrect).toBe(false);
    expect(engine.getLeaderboard()[0].score).toBe(0);
  });
});