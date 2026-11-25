/**
 * Modèle de données interne du moteur de quiz.
 *
 * IMPORTANT — architecture découplée : une question n'a plus de "type"
 * unique qui fige à la fois ce qui est présenté ET comment on y répond.
 * Deux notions indépendantes :
 *   - `media` (optionnel) : CE QUI EST MONTRÉ AU JOUEUR — image, audio, ou
 *     vidéo YouTube. N'importe quelle question peut en avoir un, ou aucun.
 *   - `answer` : LE FORMAT DE RÉPONSE ATTENDU — boolean, choice, text, ou
 *     number. Indépendant de la présence ou non d'un média.
 *
 * Exemple : une question peut être "media: image" + "answer: choice"
 * (deviner qui est sur la photo parmi des options), ou "media: youtube" +
 * "answer: text" (blindtest en réponse libre), etc. — toutes les
 * combinaisons sont valides.
 */

export type GameMode = 'individual' | 'team';
export type AnswerRevealMode = 'manual' | 'automatic';

export interface QuizSettings {
  maxPlayers: number;
  mode: GameMode;
  showAnswers: AnswerRevealMode;
}

export interface Quiz {
  title: string;
  description?: string;
  teamsEnabled: boolean;
  questions: Question[];
}

// --- Média (optionnel, attachable à n'importe quelle question) ---

export type MediaKind = 'image' | 'audio' | 'youtube';

export interface MediaRef {
  type: 'image' | 'audio' | 'youtube';
  url: string;
  clip?: { start: number };
}

// --- Format de réponse (un des 4 modes, indépendant du média) ---

export interface ChoiceOption {
  text: string;
  correct: boolean;
}

export interface BooleanAnswer {
  mode: 'boolean';
  value: boolean;
}

export interface ChoiceAnswer {
  mode: 'choice';
  multiple: boolean;
  options: ChoiceOption[];
}

export interface TextAnswer {
  mode: 'text';
  /** automatic = corrigé par le moteur (accepted/fuzzy_matching) ; manual = jugé par l'animateur */
  correction: 'automatic' | 'manual';
  accepted?: string[];
  fuzzyMatching?: boolean;
}

export interface NumberAnswer {
  mode: 'number';
  range: { min: number; max: number };
  value: number;
  tolerance: number;
}

export type AnswerSpec = BooleanAnswer | ChoiceAnswer | TextAnswer | NumberAnswer;

// --- Question ---

export interface Question {
  id: string;
  title: string;
  points: number;
  timeLimit?: number;
  media?: MediaRef;
  answer: AnswerSpec;
}

// --- Joueurs, équipes, réponses (utilisés par le moteur de jeu, pas par le parser) ---

export interface Player {
  id: string;
  nickname: string;
  teamId?: string;
  score: number;
  connected: boolean;
}

export interface Team {
  id: string;
  name: string;
  score: number;
}

export interface Answer {
  playerId: string;
  questionId: string;
  value: unknown;
  isCorrect?: boolean;
  submittedAt: number;
}
