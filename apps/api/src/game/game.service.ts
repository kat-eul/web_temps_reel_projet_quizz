import { Injectable } from '@nestjs/common';
import { GameEngine } from '../quiz-engine/engine/gameEngine';
import type { Quiz } from '../quiz-engine/models/quiz';

@Injectable()
export class GameService {
  private readonly engines = new Map<number, GameEngine>();

  createEngine(roomId: number, quiz: Quiz, maxPlayers: number): GameEngine {
    if (this.engines.has(roomId)) {
      throw new Error(`Un moteur existe déjà pour la salle ${roomId}.`);
    }

    const engine = new GameEngine(quiz, maxPlayers);
    this.engines.set(roomId, engine);
    return engine;
  }

  getEngine(roomId: number): GameEngine | undefined {
    return this.engines.get(roomId);
  }

  releaseEngine(roomId: number): void {
    this.engines.delete(roomId);
  }
}
