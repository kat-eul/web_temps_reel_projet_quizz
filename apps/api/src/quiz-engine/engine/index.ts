export type { GameState, GameSnapshot, SubmitAnswerResult } from '@quizz/shared';
export * from './gameEngine.js';
export { evaluateAnswer, requiresManualValidation, normalizeText } from './scoring.js';