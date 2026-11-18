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
import { RoomMembershipSchema } from '@quizz/shared';
import { AuthService } from './auth.service';
import { RoomService } from './room.service';

@WebSocketGateway({ cors: { origin: true } })
export class RoomGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly socketRooms = new Map<string, { roomId: number; userId: number }>();

  constructor(
    private readonly roomService: RoomService,
    private readonly authService: AuthService,
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
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization as string | undefined) ??
      '';
    return this.authService.getAuthenticatedUserId(token);
  }
}
