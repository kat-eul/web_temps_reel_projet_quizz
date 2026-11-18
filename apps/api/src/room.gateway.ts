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
import { AuthService } from './auth.service';
import { RoomService } from './room.service';
import { ChatService } from './chat.service';

@WebSocketGateway({ cors: { origin: true } })
export class RoomGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly socketRooms = new Map<string, { roomId: number; userId: number }>();

  constructor(
      private readonly roomService: RoomService,
      private readonly authService: AuthService,
      private readonly chatService: ChatService,
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
    this.server.to(`room:${room.id}`).emit('room:participant-updated', room);

    const game = await this.roomService.getGameState(room.id);
    if (game) {
      client.emit('room:started', game);
    }

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
      const game = await this.roomService.start(result.data.roomId, userId);
      this.server.to(`room:${result.data.roomId}`).emit('room:started', game);
      return { ok: true, game };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Impossible de lancer la partie.',
      };
    }
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
    const deleted = await this.roomService.leave(membership.roomId, membership.userId);
    this.socketRooms.delete(client.id);
    client.leave(`room:${membership.roomId}`);

    if (!deleted) {
      const room = await this.roomService.getById(membership.roomId);
      this.server.to(`room:${membership.roomId}`).emit('room:participant-updated', room);
    } else {
      this.server.to(`room:${membership.roomId}`).emit('room:deleted', {
        roomId: membership.roomId,
      });
    }
  }

  private getAuthenticatedUserId(client: Socket): number {
    const token = (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization as string | undefined) ??
        '';
    return this.authService.getAuthenticatedUserId(token);
  }
}