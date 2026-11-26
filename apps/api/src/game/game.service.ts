import { Injectable } from '@nestjs/common';
import { GameEngine } from '../quiz-engine/engine/gameEngine';
import type { Quiz } from '@quizz/shared';

@Injectable()
export class GameService {
  private readonly engines = new Map<number, GameEngine>();
  private readonly hostTimers = new Map<number, NodeJS.Timeout>();
  private readonly playersTimers = new Map<number, NodeJS.Timeout>();

  startHostGrace(roomId: number, onExpire: () => void, ms = 45_000): void {
    this.cancelHostGrace(roomId);
    const timer = setTimeout(() => {
      this.hostTimers.delete(roomId);
      onExpire();
    }, ms);
    this.hostTimers.set(roomId, timer);
  }

  cancelHostGrace(roomId: number): void {
    const timer = this.hostTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.hostTimers.delete(roomId);
    }
  }

  startPlayersGrace(roomId: number, onExpire: () => void, ms = 30_000): void {
    this.cancelPlayersGrace(roomId);
    const timer = setTimeout(() => {
      this.playersTimers.delete(roomId);
      onExpire();
    }, ms);
    this.playersTimers.set(roomId, timer);
  }

  cancelPlayersGrace(roomId: number): void {
    const timer = this.playersTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.playersTimers.delete(roomId);
    }
  }

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
    this.cancelHostGrace(roomId);
    this.cancelPlayersGrace(roomId);
    this.engines.delete(roomId);
  }
}
