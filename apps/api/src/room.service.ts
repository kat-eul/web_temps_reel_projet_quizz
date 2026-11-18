import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoomInput, Room } from '@quizz/shared';
import { PrismaService } from './prisma.service';

@Injectable()
export class RoomService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Room[]> {
    const rooms = await this.prisma.room.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return rooms.map((room) => ({
      id: room.id,
      name: room.name,
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
        nbParticipants: input.nbParticipants,
        quizId: input.quizId,
      },
    });

    return {
      id: room.id,
      name: room.name,
      nbParticipants: room.nbParticipants,
      quizId: room.quizId,
      createdAt: room.createdAt.toISOString(),
    };
  }
}