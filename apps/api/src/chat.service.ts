import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessage, SendChatMessageSchema } from '@quizz/shared';
import { PrismaService } from './prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async history(roomId: number, userId: number): Promise<ChatMessage[]> {
    await this.ensureMember(roomId, userId);

    const messages = await this.prisma.chatMessage.findMany({
      where: { roomId },
      include: { sender: { select: { pseudo: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((message) => ({
      id: message.id,
      roomId: message.roomId,
      senderId: message.senderId,
      senderPseudo: message.sender.pseudo,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }));
  }

  async send(
    roomId: number,
    userId: number,
    content: string,
  ): Promise<ChatMessage> {
    const payload = SendChatMessageSchema.safeParse({ roomId, content });
    if (!payload.success) {
      throw new ForbiddenException('Message vide ou trop long.');
    }

    await this.ensureMember(roomId, userId);

    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        senderId: userId,
        content: payload.data.content,
      },
      include: { sender: { select: { pseudo: true } } },
    });

    return {
      id: message.id,
      roomId: message.roomId,
      senderId: message.senderId,
      senderPseudo: message.sender.pseudo,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private async ensureMember(roomId: number, userId: number): Promise<void> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Salle introuvable.');
    }

    const membership = await this.prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('Vous n’appartenez pas à cette salle.');
    }
  }
}
