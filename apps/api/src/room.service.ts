import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CreateRoomInput, Room } from '@quizz/shared';
import { PrismaService } from './prisma.service';

@Injectable()
export class RoomService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.deleteEmptyRooms();
  }

  async list(): Promise<Room[]> {
    const rooms = await this.prisma.room.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return rooms.map((room) => ({
      id: room.id,
      name: room.name,
      nbMaxParticipants: room.nbMaxParticipants,
      nbParticipants: room.nbParticipants,
      quizId: room.quizId,
      createdAt: room.createdAt.toISOString(),
    }));
  }

  async getById(id: number): Promise<Room> {
    const room = await this.prisma.room.findUnique({ where: { id } });

    if (!room) {
      throw new NotFoundException('Salle introuvable.');
    }

    return {
      id: room.id,
      name: room.name,
      nbMaxParticipants: room.nbMaxParticipants,
      nbParticipants: room.nbParticipants,
      quizId: room.quizId,
      createdAt: room.createdAt.toISOString(),
    };
  }

  async create(input: CreateRoomInput): Promise<Room> {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: input.quizId } });
    if (!quiz) {
      throw new NotFoundException('Le quiz sélectionné est introuvable.');
    }

    const existing = await this.prisma.room.findUnique({ where: { name: input.name } });
    if (existing) {
      throw new ConflictException('Une salle avec ce nom existe déjà.');
    }

    const room = await this.prisma.room.create({
      data: {
        name: input.name.trim(),
        nbMaxParticipants: input.nbMaxParticipants,
        nbParticipants: 0,
        quizId: input.quizId,
      },
    });

    return {
      id: room.id,
      name: room.name,
      nbMaxParticipants: room.nbMaxParticipants,
      nbParticipants: room.nbParticipants,
      quizId: room.quizId,
      createdAt: room.createdAt.toISOString(),
    };
  }

  async join(roomId: number, userId: number): Promise<Room> {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { _count: { select: { participants: true } } },
      });

      if (!room) {
        throw new NotFoundException('Salle introuvable.');
      }

      if (room._count.participants >= room.nbMaxParticipants) {
        throw new ConflictException('La salle est complète.');
      }

      await tx.roomParticipant.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: { roomId, userId },
        update: {},
      });

      const nbParticipants = await tx.roomParticipant.count({ where: { roomId } });
      const updated = await tx.room.update({
        where: { id: roomId },
        data: { nbParticipants },
      });

      return {
        id: updated.id,
        name: updated.name,
        nbMaxParticipants: updated.nbMaxParticipants,
        nbParticipants: updated.nbParticipants,
        quizId: updated.quizId,
        createdAt: updated.createdAt.toISOString(),
      };
    });
  }

  async leave(roomId: number, userId: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.roomParticipant.deleteMany({
        where: { roomId, userId },
      });

      const nbParticipants = await tx.roomParticipant.count({ where: { roomId } });

      if (nbParticipants === 0) {
        const deleted = await tx.room.deleteMany({
          where: {
            id: roomId,
            participants: { none: {} },
          },
        });
        return deleted.count > 0;
      }

      await tx.room.update({
        where: { id: roomId },
        data: { nbParticipants },
      });
      return false;
    });
  }

  async deleteEmptyRooms(): Promise<number> {
    const result = await this.prisma.room.deleteMany({
      where: { participants: { none: {} } },
    });
    return result.count;
  }
}