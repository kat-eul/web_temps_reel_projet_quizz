import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  ChatHistorySchema,
  RoomMembershipSchema,
  RoomStartSchema,
  SendChatMessageSchema,
} from '@quizz/shared';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { RoomService } from './room.service';
import { ChatService } from './chat.service';
import { GameService } from './game/game.service';
import { GameEngine } from './quiz-engine/engine/gameEngine';
import { parseQuizString } from './quiz-engine/parser/index.js';

const RoomManualValidationSchema = z.object({
  roomId: z.coerce.number().int().positive(),
  playerId: z.string(),
  isCorrect: z.boolean(),
});

@WebSocketGateway({ cors: { origin: true } })
export class RoomGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly socketRooms = new Map<string, { roomId: number; userId: number }>();
  private readonly ownerSockets = new Map<number, number>();

  constructor(
      private readonly roomService: RoomService,
      private readonly authService: AuthService,
      private readonly chatService: ChatService,
      private readonly gameService: GameService,
  ) {}

  @SubscribeMessage('room:join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const userId = this.getAuthenticatedUserId(client);
    const result = RoomMembershipSchema.safeParse(payload);
    if (!result.success) {
      throw new WsException('Payload de salle invalide.');
    }

    const previous = this.socketRooms.get(client.id);
    if (previous && previous.roomId !== result.data.roomId) {
      await this.leaveSocket(client, previous);
    }

    const room = await this.roomService.join(result.data.roomId, userId);
    this.socketRooms.set(client.id, { roomId: room.id, userId });
    client.join(`room:${room.id}`);
    if (userId === room.ownerId) {
      this.ownerSockets.set(room.id, (this.ownerSockets.get(room.id) ?? 0) + 1);
      this.gameService.cancelHostGrace(room.id);
      this.server.to(`room:${room.id}`).emit('game:host-status', { connected: true });
      if (this.gameService.getEngine(room.id)) {
        this.broadcastSnapshot(room.id);
      }
    } else {
      const engine = this.gameService.getEngine(room.id);
      if (engine) {
        try {
          engine.setPlayerConnected(String(userId), true);
        } catch {
          // Ignore players not present in the current game engine.
        }
        this.broadcastSnapshot(room.id);
      }
      client.emit('game:host-status', { connected: (this.ownerSockets.get(room.id) ?? 0) > 0 });
    }
    const engine = this.gameService.getEngine(room.id);
    if (engine) {
      client.emit('game:snapshot', engine.getSnapshot());
    }
    this.server.to(`room:${room.id}`).emit('room:participant-updated', room);

    const messages = await this.chatService.history(room.id, userId);
    client.emit('room:chat-history', messages);
  }

  @SubscribeMessage('room:chat-history')
  async getChatHistory(
      @ConnectedSocket() client: Socket,
      @MessageBody() payload: unknown,
  ) {
    const result = ChatHistorySchema.safeParse(payload);
    if (!result.success) {
      throw new WsException('Payload d’historique invalide.');
    }

    const membership = this.socketRooms.get(client.id);
    if (!membership || membership.roomId !== result.data.roomId) {
      throw new WsException('Vous n’appartenez pas à cette salle.');
    }

    const messages = await this.chatService.history(
        result.data.roomId,
        membership.userId,
    );
    client.emit('room:chat-history', messages);
  }

  @SubscribeMessage('room:chat-send')
  async sendChatMessage(
      @ConnectedSocket() client: Socket,
      @MessageBody() payload: unknown,
  ): Promise<{ ok: true; message: unknown } | { ok: false; error: string }> {
    const result = SendChatMessageSchema.safeParse(payload);
    if (!result.success) {
      return { ok: false, error: 'Message vide ou trop long.' };
    }

    const membership = this.socketRooms.get(client.id);
    if (!membership || membership.roomId !== result.data.roomId) {
      return { ok: false, error: 'Vous n’appartenez pas à cette salle.' };
    }

    try {
      const message = await this.chatService.send(
          result.data.roomId,
          membership.userId,
          result.data.content,
      );
      this.server.to(`room:${result.data.roomId}`).emit('room:chat-message', message);
      return { ok: true, message };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Impossible d’envoyer le message.',
      };
    }
  }

  @SubscribeMessage('room:start')
  async start(
      @ConnectedSocket() client: Socket,
      @MessageBody() payload: unknown,
  ): Promise<{ ok: true; game: unknown } | { ok: false; error: string }> {
    const userId = this.getAuthenticatedUserId(client);
    const result = RoomStartSchema.safeParse(payload);
    if (!result.success) {
      return { ok: false, error: 'Payload de lancement invalide.' };
    }

    const membership = this.socketRooms.get(client.id);
    if (!membership || membership.roomId !== result.data.roomId) {
      return { ok: false, error: 'Vous n’appartenez pas à cette salle.' };
    }

    try {
      await this.assertOwner(result.data.roomId, userId);
      const data = await this.roomService.getStartData(result.data.roomId);
      if (data.state !== 'WAITING') {
        throw new WsException('La partie est déjà lancée ou terminée.');
      }
      const quiz = parseQuizString(data.quizYaml);
      const roomId = result.data.roomId;
      let engine: GameEngine | undefined;
      try {
        engine = this.gameService.createEngine(roomId, quiz, data.maxPlayers);
        for (const m of data.members.filter((m) => m.userId !== data.ownerId)) {
          engine.addPlayer(m.userId, m.pseudo);
        }
        engine.startGame();
        await this.roomService.markInProgress(roomId);
      } catch (error) {
        this.gameService.releaseEngine(roomId);
        throw error;
      }
      this.broadcastSnapshot(roomId);
      return { ok: true, game: engine.getSnapshot() };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Impossible de lancer la partie.',
      };
    }
  }

  @SubscribeMessage('room:lock')
  async lockCurrentQuestion(
      @ConnectedSocket() client: Socket,
      @MessageBody() payload: unknown,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.runAsOwner(
        client,
        payload,
        RoomMembershipSchema,
        (engine) => engine.lockCurrentQuestion(),
    );
  }

  @SubscribeMessage('room:correct')
  async enterCorrection(
      @ConnectedSocket() client: Socket,
      @MessageBody() payload: unknown,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.runAsOwner(
        client,
        payload,
        RoomMembershipSchema,
        (engine) => engine.enterCorrection(),
    );
  }

  @SubscribeMessage('room:next')
  async nextQuestion(
      @ConnectedSocket() client: Socket,
      @MessageBody() payload: unknown,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.runAsOwner(
        client,
        payload,
        RoomMembershipSchema,
        (engine) => engine.nextQuestion(),
    );
  }

  @SubscribeMessage('room:validate')
  async validateManualAnswer(
      @ConnectedSocket() client: Socket,
      @MessageBody() payload: unknown,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.runAsOwner(
        client,
        payload,
        RoomManualValidationSchema,
        (engine, _roomId, data) => {
          engine.validateManualAnswer(data.playerId, data.isCorrect);
        },
    );
  }

  @SubscribeMessage('room:answer')
  async submitAnswer(
      @ConnectedSocket() client: Socket,
      @MessageBody() payload: unknown,
  ): Promise<{ accepted: boolean; reason?: string; isCorrect?: boolean }> {
    const userId = this.getAuthenticatedUserId(client);
    if (typeof payload !== 'object' || payload === null || !('value' in payload)) {
      return { accepted: false, reason: 'Payload invalide.' };
    }

    const result = RoomMembershipSchema.safeParse(payload);
    if (!result.success) {
      return { accepted: false, reason: 'Payload invalide.' };
    }

    const membership = this.socketRooms.get(client.id);
    if (!membership || membership.roomId !== result.data.roomId) {
      return { accepted: false, reason: 'Vous n’appartenez pas à cette salle.' };
    }

    const engine = this.gameService.getEngine(result.data.roomId);
    if (!engine) {
      return { accepted: false, reason: 'La partie n’est pas lancée.' };
    }

    let room;
    try {
      room = await this.roomService.getById(result.data.roomId);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : 'Une erreur est survenue.';
      return { accepted: false, reason: message };
    }

    if (userId === room.ownerId) {
      return { accepted: false, reason: 'L’animateur ne joue pas.' };
    }

    let answerResult;
    try {
      answerResult = engine.submitAnswer(String(userId), payload.value);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Une erreur est survenue.';
      return { accepted: false, reason: message };
    }
    if (answerResult.accepted) {
      if (engine.shouldAutoLock()) {
        try {
          engine.lockCurrentQuestion();
        } catch {
          // La question a déjà changé d'état : rien à faire.
        }
      }
      this.broadcastSnapshot(result.data.roomId);
    }
    const state = engine.getSnapshot().state;
    if (state === 'correction' || state === 'finished') {
      return answerResult;
    }
    return { accepted: answerResult.accepted, reason: answerResult.reason };
  }

  @SubscribeMessage('room:leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const result = RoomMembershipSchema.safeParse(payload);
    if (!result.success) {
      throw new WsException('Payload de salle invalide.');
    }

    const membership = this.socketRooms.get(client.id);
    if (!membership || membership.roomId !== result.data.roomId) {
      return;
    }

    await this.leaveSocket(client, membership);
  }

  private async assertOwner(roomId: number, userId: number): Promise<void> {
    const room = await this.roomService.getById(roomId);
    if (room.ownerId !== userId) {
      throw new WsException('Seul l’animateur peut piloter la partie.');
    }
  }

  private async runAsOwner<T extends { roomId: number }>(
      client: Socket,
      payload: unknown,
      schema: z.ZodType<T>,
      action: (engine: GameEngine, roomId: number, data: T) => void | Promise<void>,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const userId = this.getAuthenticatedUserId(client);
    const result = schema.safeParse(payload);
    if (!result.success) {
      return { ok: false, error: 'Payload invalide.' };
    }

    const roomId = result.data.roomId;
    const membership = this.socketRooms.get(client.id);
    if (!membership || membership.roomId !== roomId) {
      return { ok: false, error: 'Vous n’appartenez pas à cette salle.' };
    }

    try {
      await this.assertOwner(roomId, userId);
      const engine = this.gameService.getEngine(roomId);
      if (!engine) {
        return { ok: false, error: 'La partie n’est pas lancée.' };
      }
      await action(engine, roomId, result.data);
      this.broadcastSnapshot(roomId);
      if (engine.getSnapshot().state === 'finished') {
        try {
          const room = await this.roomService.getById(roomId);
          await this.finishGame(roomId, room.ownerId);
        } catch (error) {
          this.gameService.releaseEngine(roomId);
          console.error(`Finalisation de la salle ${roomId} échouée :`, error);
        }
      }
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : 'Une erreur est survenue.';
      return { ok: false, error: message };
    }
  }

  private broadcastSnapshot(roomId: number): void {
    const engine = this.gameService.getEngine(roomId);
    if (!engine) return;
    this.server.to(`room:${roomId}`).emit('game:snapshot', engine.getSnapshot());
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const membership = this.socketRooms.get(client.id);
    if (membership) {
      await this.leaveSocket(client, membership);
    }
  }

  private async leaveSocket(
      client: Socket,
      membership: { roomId: number; userId: number },
  ): Promise<void> {
    const room = await this.roomService.getById(membership.roomId);
    this.socketRooms.delete(client.id);
    client.leave(`room:${membership.roomId}`);

    if (membership.userId === room.ownerId) {
      const remainingSockets = (this.ownerSockets.get(room.id) ?? 1) - 1;
      if (remainingSockets <= 0) {
        this.ownerSockets.delete(room.id);
        const engine = this.gameService.getEngine(room.id);
        if (engine?.getSnapshot().state === 'question_active') {
          try {
            engine.lockCurrentQuestion();
          } catch {
            // Ignore if the question state changed while disconnecting.
          }
        }
        this.server.to(`room:${room.id}`).emit('game:host-status', { connected: false });
        this.gameService.startHostGrace(room.id, () => {
          void this.onHostGraceExpired(room.id);
        });
        this.broadcastSnapshot(room.id);
      } else {
        this.ownerSockets.set(room.id, remainingSockets);
      }
      return;
    }

    if (room.state === 'IN_PROGRESS') {
      const engine = this.gameService.getEngine(room.id);
      if (engine) {
        try {
          engine.setPlayerConnected(String(membership.userId), false);
          if (engine.shouldAutoLock()) {
            engine.lockCurrentQuestion();
          }
        } catch {
          // Joueur absent du moteur, ou état déjà modifié : rien à faire.
        }
      }
      this.broadcastSnapshot(room.id);
      return;
    }

    const deleted = await this.roomService.leave(membership.roomId, membership.userId);
    if (deleted) {
      this.server.to(`room:${membership.roomId}`).emit('room:deleted', {
        roomId: membership.roomId,
      });
      return;
    }
    const updatedRoom = await this.roomService.getById(membership.roomId);
    this.server.to(`room:${membership.roomId}`).emit('room:participant-updated', updatedRoom);
  }

  private async onHostGraceExpired(roomId: number): Promise<void> {
    const engine = this.gameService.getEngine(roomId);
    if (engine) {
      try { engine.closeOnExpiry(); } catch { /* état déjà final */ }
      const ranking = engine.getLeaderboard().map((p) => ({ nickname: p.nickname, score: p.score }));
      const room = await this.roomService.getById(roomId);
      if (room.state === 'WAITING') {
        await this.roomService.deleteRoom(roomId);
        this.gameService.releaseEngine(roomId);
        this.server.to(`room:${roomId}`).emit('room:deleted', { roomId });
        return;
      }
      await this.finishGame(roomId, room.ownerId);
      return;
    }
    await this.roomService.deleteRoom(roomId).catch(() => undefined);
  }

  private async finishGame(roomId: number, ownerId: number): Promise<void> {
    const engine = this.gameService.getEngine(roomId);
    const ranking = engine?.getLeaderboard().map((p) => ({ nickname: p.nickname, score: p.score })) ?? [];
    try {
      await this.roomService.markFinished(roomId);
    } catch (error) {
      try {
        await this.roomService.markFinished(roomId);
      } catch (retryError) {
        console.error(`markFinished a échoué deux fois pour la salle ${roomId} :`, retryError);
      }
    }
    this.gameService.releaseEngine(roomId);
    const sockets = await this.server.in(`room:${roomId}`).fetchSockets();
    for (const s of sockets) {
      const m = this.socketRooms.get(s.id);
      if (m && m.userId !== ownerId) {
        s.emit('game:ended', { ranking });
      }
    }
  }

  private getAuthenticatedUserId(client: Socket): number {
    const token = (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization as string | undefined) ??
        '';
    return this.authService.getAuthenticatedUserId(token);
  }
}