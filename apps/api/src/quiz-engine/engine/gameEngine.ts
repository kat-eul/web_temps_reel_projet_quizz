import { randomUUID } from 'node:crypto';
import type { Quiz, Player, Team, Answer, Question } from '../models/quiz.js';
import type { GameState, GameSnapshot, SubmitAnswerResult } from './types.js';
import { evaluateAnswer, requiresManualValidation } from './scoring.js';

export class GameEngineError extends Error {}

/**
 * Machine à états d'une partie. Ne connaît rien de Vue ni du réseau — le
 * serveur se contente d'appeler ces méthodes en réponse aux événements
 * WebSocket, puis de diffuser getSnapshot() aux clients.
 *
 *   lobby → question_active → question_locked → correction → (question suivante ou finished)
 */
export class GameEngine {
  private readonly quiz: Quiz;
  private state: GameState = 'lobby';
  private currentQuestionIndex = 0;

  private readonly players = new Map<string, Player>();
  private readonly teams = new Map<string, Team>();
  // answers[questionId][playerId] = Answer
  private readonly answers = new Map<string, Map<string, Answer>>();

  constructor(quiz: Quiz) {
    this.quiz = quiz;
  }

  // --- Joueurs & équipes ---

  addPlayer(nickname: string, teamId?: string): Player {
    if (this.state === 'finished') {
      throw new GameEngineError('La partie est terminée, impossible de rejoindre.');
    }
    if (this.players.size >= this.quiz.settings.maxPlayers) {
      throw new GameEngineError(`La partie est complète (max ${this.quiz.settings.maxPlayers} joueurs).`);
    }
    if (this.quiz.teamsEnabled && teamId && !this.teams.has(teamId)) {
      throw new GameEngineError(`L'équipe '${teamId}' n'existe pas.`);
    }

    // Un joueur qui rejoint après le début de la partie (state !== 'lobby')
    // est accepté avec un score de départ à 0 — il n'a simplement pas de
    // réponses enregistrées sur les questions déjà jouées.
    const player: Player = {
      id: randomUUID(),
      nickname,
      teamId: this.quiz.teamsEnabled ? teamId : undefined,
      score: 0,
      connected: true,
    };
    this.players.set(player.id, player);
    return player;
  }

  /** Retrouve un joueur déjà connu du moteur — utilisé pour la reprise de session après un refresh. */
  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
  }

  setPlayerConnected(playerId: string, connected: boolean): void {
    const player = this.requirePlayer(playerId);
    player.connected = connected;
  }

  addTeam(name: string): Team {
    if (!this.quiz.teamsEnabled) {
      throw new GameEngineError("Ce quiz n'a pas les équipes activées (teams.enabled: false).");
    }
    const team: Team = { id: randomUUID(), name, score: 0 };
    this.teams.set(team.id, team);
    return team;
  }

  assignPlayerToTeam(playerId: string, teamId: string): void {
    const player = this.requirePlayer(playerId);
    if (!this.teams.has(teamId)) {
      throw new GameEngineError(`L'équipe '${teamId}' n'existe pas.`);
    }
    player.teamId = teamId;
  }

  // --- Cycle de vie de la partie ---

  startGame(): void {
    this.assertState('lobby', 'startGame');
    if (this.quiz.questions.length === 0) {
      throw new GameEngineError('Le quiz ne contient aucune question.');
    }
    this.currentQuestionIndex = 0;
    this.state = 'question_active';
  }

  /** Ferme la question courante : plus aucune réponse n'est acceptée. */
  lockCurrentQuestion(): void {
    this.assertState('question_active', 'lockCurrentQuestion');
    this.state = 'question_locked';
  }

  /** Passe en mode correction : réponses/scores visibles, validation manuelle possible. */
  enterCorrection(): void {
    this.assertState('question_locked', 'enterCorrection');
    this.state = 'correction';
  }

  /** Passe à la question suivante, ou termine la partie si c'était la dernière. */
  nextQuestion(): void {
    this.assertState('correction', 'nextQuestion');

    if (this.hasPendingManualValidation()) {
      throw new GameEngineError(
          'Des réponses manuelles ne sont pas encore validées pour cette question.'
      );
    }

    const isLastQuestion = this.currentQuestionIndex >= this.quiz.questions.length - 1;
    if (isLastQuestion) {
      this.state = 'finished';
      return;
    }
    this.currentQuestionIndex += 1;
    this.state = 'question_active';
  }

  // --- Réponses ---

  submitAnswer(playerId: string, value: unknown): SubmitAnswerResult {
    if (this.state !== 'question_active') {
      return { accepted: false, reason: "La question n'accepte plus de réponses." };
    }
    this.requirePlayer(playerId);

    const question = this.currentQuestion;
    const questionAnswers = this.answersFor(question.id);

    if (questionAnswers.has(playerId)) {
      return { accepted: false, reason: 'Ce joueur a déjà répondu à cette question.' };
    }

    const isCorrect = evaluateAnswer(question, value);

    const answer: Answer = {
      playerId,
      questionId: question.id,
      value,
      isCorrect: isCorrect ?? undefined,
      submittedAt: Date.now(),
    };
    questionAnswers.set(playerId, answer);

    // Correction automatique : on applique les points immédiatement.
    // Correction manuelle (isCorrect === null) : on attend validateManualAnswer().
    if (isCorrect === true) {
      this.applyPoints(playerId, question.points);
    }

    return { accepted: true, isCorrect: isCorrect ?? undefined };
  }

  /**
   * Validation individuelle d'une réponse manuelle par l'animateur
   * (question type 'text' en validation.mode 'manual').
   * Peut être appelée plusieurs fois pour un même joueur si l'animateur
   * change d'avis : le score est ajusté en conséquence, jamais dupliqué.
   */
  validateManualAnswer(playerId: string, isCorrect: boolean): void {
    if (this.state !== 'question_locked' && this.state !== 'correction') {
      throw new GameEngineError('La validation manuelle est possible uniquement une fois la question verrouillée.');
    }

    const question = this.currentQuestion;
    if (!requiresManualValidation(question)) {
      throw new GameEngineError("Cette question n'est pas en correction manuelle.");
    }

    const questionAnswers = this.answersFor(question.id);
    const answer = questionAnswers.get(playerId);
    if (!answer) {
      throw new GameEngineError(`Aucune réponse trouvée pour ce joueur sur la question '${question.id}'.`);
    }

    const previouslyCorrect = answer.isCorrect === true;
    answer.isCorrect = isCorrect;

    if (previouslyCorrect && !isCorrect) {
      this.applyPoints(playerId, -question.points);
    } else if (!previouslyCorrect && isCorrect) {
      this.applyPoints(playerId, question.points);
    }
    // si l'état ne change pas (correct→correct ou faux→faux), rien à ajuster
  }

  /** Réponses reçues pour la question en cours, y compris avant verrouillage (utile pour un compteur en direct côté animateur). */
  getCurrentQuestionAnswers(): Answer[] {
    if (this.state === 'lobby') return [];
    return [...this.answersFor(this.currentQuestion.id).values()];
  }

  hasPendingManualValidation(): boolean {
    const question = this.currentQuestion;
    if (!requiresManualValidation(question)) return false;

    const questionAnswers = this.answersFor(question.id);
    return [...questionAnswers.values()].some((a) => a.isCorrect === undefined);
  }

  // --- Lecture d'état ---

  get currentQuestion(): Question {
    return this.quiz.questions[this.currentQuestionIndex];
  }

  getLeaderboard(): Player[] {
    return [...this.players.values()].sort((a, b) => b.score - a.score);
  }

  getTeamLeaderboard(): Team[] {
    return [...this.teams.values()].sort((a, b) => b.score - a.score);
  }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      quizTitle: this.quiz.title,
      totalQuestions: this.quiz.questions.length,
      teamsEnabled: this.quiz.teamsEnabled,
      currentQuestionIndex: this.currentQuestionIndex,
      currentQuestion: this.state === 'lobby' ? null : this.currentQuestion,
      players: [...this.players.values()],
      teams: [...this.teams.values()],
      currentQuestionAnswers: this.getCurrentQuestionAnswers(),
      pendingManualValidation: this.state === 'lobby' ? false : this.hasPendingManualValidation(),
    };
  }

  // --- Utilitaires internes ---

  private applyPoints(playerId: string, points: number): void {
    const player = this.requirePlayer(playerId);
    player.score += points;

    if (player.teamId) {
      const team = this.teams.get(player.teamId);
      if (team) team.score += points;
    }
  }

  private answersFor(questionId: string): Map<string, Answer> {
    if (!this.answers.has(questionId)) {
      this.answers.set(questionId, new Map());
    }
    return this.answers.get(questionId)!;
  }

  private requirePlayer(playerId: string): Player {
    const player = this.players.get(playerId);
    if (!player) throw new GameEngineError(`Joueur inconnu : '${playerId}'.`);
    return player;
  }

  private assertState(expected: GameState, action: string): void {
    if (this.state !== expected) {
      throw new GameEngineError(
          `Action '${action}' impossible depuis l'état '${this.state}' (attendu : '${expected}').`
      );
    }
  }
}