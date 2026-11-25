import type { Player, Team, Question, Answer } from './quiz';

/**
 * États possibles d'une partie.
 *
 *   lobby            → les joueurs rejoignent, la partie n'a pas démarré
 *   question_active   → la question en cours accepte les réponses
 *   question_locked    → plus de réponses acceptées, en attente de correction
 *   correction           → réponses/scores affichés (et validation manuelle en cours si besoin)
 *   finished               → toutes les questions ont été jouées
 */
export type GameState = 'lobby' | 'question_active' | 'question_locked' | 'correction' | 'finished';

/**
 * Ce que le moteur expose au serveur (puis au host via WebSocket) à chaque
 * changement d'état. Ne contient jamais les réponses correctes tant que la
 * question n'est pas en 'correction', pour ne pas les fuiter aux joueurs.
 */
export interface GameSnapshot {
  state: GameState;
  quizTitle: string;
  totalQuestions: number;
  teamsEnabled: boolean;
  currentQuestionIndex: number;
  currentQuestion: Question | null;
  players: Player[];
  teams: Team[];
  /** réponses reçues pour la question courante (vide en lobby) — permet à l'animateur de voir qui a répondu quoi */
  currentQuestionAnswers: Answer[];
  /** true si la question courante contient des réponses manuelles en attente de validation */
  pendingManualValidation: boolean;
}

export interface SubmitAnswerResult {
  accepted: boolean;
  reason?: string;
  /** undefined si la correction est manuelle et pas encore jugée */
  isCorrect?: boolean;
}
