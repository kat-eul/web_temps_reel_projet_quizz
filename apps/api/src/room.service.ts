import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CreateRoomInput, Room } from '@quizz/shared';
import { PrismaService } from './prisma.service';

@Injectable()
export class RoomService implements OnModuleInit {
  private roomVersion = 0;
  private readonly pendingPolls = new Set<(changed: boolean) => void>();

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

    const createdRoom = {
      id: room.id,
      name: room.name,
      nbMaxParticipants: room.nbMaxParticipants,
      nbParticipants: room.nbParticipants,
      quizId: room.quizId,
      createdAt: room.createdAt.toISOString(),
    };
    this.notifyChanged();
    return createdRoom;
  }

  async join(roomId: number, userId: number): Promise<Room> {
    const joined = await this.prisma.$transaction(async (tx) => {
      const lockedRooms = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "Room" WHERE "id" = ${roomId} FOR UPDATE
      `;
      if (lockedRooms.length === 0) {
        throw new NotFoundException('Salle introuvable.');
      }
      await tx.$queryRaw`
        SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `;

      const existingMembership = await tx.roomParticipant.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      if (existingMembership) {
        return tx.room.findUniqueOrThrow({ where: { id: roomId } });
      }

      const otherMembership = await tx.roomParticipant.findFirst({
        where: { userId, roomId: { not: roomId } },
        include: { room: true },
      });
      if (otherMembership) {
        throw new ConflictException('Vous êtes déjà connecté à une autre salle.');
      }

      const nbParticipants = await tx.roomParticipant.count({ where: { roomId } });
      const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
      if (nbParticipants >= room.nbMaxParticipants) {
        throw new ConflictException('La salle est complète.');
      }

      await tx.roomParticipant.create({
        data: { roomId, userId },
      });

      const updated = await tx.room.update({
        where: { id: roomId },
        data: { nbParticipants: nbParticipants + 1 },
      });

      return updated;
    });

    this.notifyChanged();
    return {
      id: joined.id,
      name: joined.name,
      nbMaxParticipants: joined.nbMaxParticipants,
      nbParticipants: joined.nbParticipants,
      quizId: joined.quizId,
      createdAt: joined.createdAt.toISOString(),
    };
  }

  async leave(roomId: number, userId: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT "id" FROM "Room" WHERE "id" = ${roomId} FOR UPDATE
      `;

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
        if (deleted.count > 0) {
          this.notifyChanged();
        }
        return deleted.count > 0;
      }

      await tx.room.update({
        where: { id: roomId },
        data: { nbParticipants },
      });
      this.notifyChanged();
      return false;
    });
  }

  async deleteEmptyRooms(): Promise<number> {
    const result = await this.prisma.room.deleteMany({
      where: { participants: { none: {} } },
    });
    if (result.count > 0) {
      this.notifyChanged();
    }
    return result.count;
  }

  async poll(version: number): Promise<{
    rooms: Room[];
    version: number;
    changed: boolean;
  }> {
    if (version !== this.roomVersion) {
      return {
        rooms: await this.list(),
        version: this.roomVersion,
        changed: true,
      };
    }

    const changed = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingPolls.delete(resolvePoll);
        resolve(false);
      }, 30_000);

      const resolvePoll = (hasChanged: boolean) => {
        clearTimeout(timeout);
        this.pendingPolls.delete(resolvePoll);
        resolve(hasChanged);
      };

      this.pendingPolls.add(resolvePoll);
    });

    return {
      rooms: await this.list(),
      version: this.roomVersion,
      changed,
    };
  }

  private notifyChanged(): void {
    this.roomVersion += 1;
    for (const resolve of Array.from(this.pendingPolls)) {
      resolve(true);
    }
  }
}