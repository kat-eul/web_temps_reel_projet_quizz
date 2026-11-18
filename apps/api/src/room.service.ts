import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { CreateRoomInput, Room, RoomStarted } from '@quizz/shared';
import { PrismaService } from './prisma.service';

@Injectable()
export class RoomService implements OnModuleInit {
  private readonly questionDurationMs = 30_000;
  private roomVersion = 0;
  private readonly pendingPolls = new Set<(changed: boolean) => void>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.deleteEmptyRooms();
  }

  async list(): Promise<Room[]> {
    const rooms = await this.prisma.room.findMany({
      where: { state: 'WAITING' },
      orderBy: { createdAt: 'desc' },
    });

    return rooms.map((room) => this.toRoom(room));
  }

  async getById(id: number): Promise<Room> {
    const room = await this.prisma.room.findUnique({ where: { id } });

    if (!room) {
      throw new NotFoundException('Salle introuvable.');
    }

    return this.toRoom(room);
  }

  async create(input: CreateRoomInput, ownerId: number): Promise<Room> {
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
        ownerId,
      },
    });

    const createdRoom = this.toRoom(room);
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
      const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
      if (room.state !== 'WAITING') {
        if (existingMembership) {
          return room;
        }
        throw new ConflictException('Cette partie a déjà commencé.');
      }
      if (existingMembership) {
        return room;
      }

      const otherMembership = await tx.roomParticipant.findFirst({
        where: { userId, roomId: { not: roomId } },
        include: { room: true },
      });
      if (otherMembership) {
        throw new ConflictException('Vous êtes déjà connecté à une autre salle.');
      }

      const nbParticipants = await tx.roomParticipant.count({ where: { roomId } });
      if (room.state !== 'WAITING') {
        throw new ConflictException('Cette partie a déjà commencé.');
      }
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
    return this.toRoom(joined);
  }

  async start(roomId: number, userId: number): Promise<RoomStarted> {
    return this.prisma.$transaction(async (tx) => {
      const lockedRooms = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "Room" WHERE "id" = ${roomId} FOR UPDATE
      `;
      if (lockedRooms.length === 0) {
        throw new NotFoundException('Salle introuvable.');
      }

      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { quiz: { include: { questions: { orderBy: { id: 'asc' }, take: 1 } } } },
      });
      if (!room) {
        throw new NotFoundException('Salle introuvable.');
      }
      if (room.ownerId !== userId) {
        throw new ForbiddenException('Seul le propriétaire de la salle peut lancer la partie.');
      }
      if (room.state !== 'WAITING') {
        throw new ConflictException('La partie est déjà lancée ou terminée.');
      }

      const question = room.quiz.questions[0];
      if (!question) {
        throw new ConflictException('Ce quiz ne contient aucune question.');
      }

      const questionAnswers = await tx.answer.findMany({
        where: { questionId: question.id },
        select: { id: true, enonce: true },
      });
      const questionStartedAt = new Date();
      const questionEndsAt = new Date(questionStartedAt.getTime() + this.questionDurationMs);

      const started = await tx.room.updateMany({
        where: { id: roomId, state: 'WAITING' },
        data: {
          state: 'IN_PROGRESS',
          currentQuestionId: question.id,
          questionStartedAt,
          questionEndsAt,
        },
      });
      if (started.count !== 1) {
        throw new ConflictException('La partie est déjà lancée ou terminée.');
      }

      this.notifyChanged();
      return {
        roomId,
        state: 'IN_PROGRESS',
        question: {
          id: question.id,
          question: question.question,
          answers: questionAnswers,
        },
        questionStartedAt: questionStartedAt.toISOString(),
        questionEndsAt: questionEndsAt.toISOString(),
      };
    });
  }

  async getGameState(roomId: number): Promise<RoomStarted | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        currentQuestion: {
          include: {
            answers: { select: { id: true, enonce: true } },
          },
        },
      },
    });
    if (
      !room ||
      room.state !== 'IN_PROGRESS' ||
      !room.currentQuestion ||
      !room.questionStartedAt ||
      !room.questionEndsAt
    ) {
      return null;
    }

    return {
      roomId: room.id,
      state: 'IN_PROGRESS',
      question: {
        id: room.currentQuestion.id,
        question: room.currentQuestion.question,
        answers: room.currentQuestion.answers,
      },
      questionStartedAt: room.questionStartedAt.toISOString(),
      questionEndsAt: room.questionEndsAt.toISOString(),
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

  private toRoom(room: {
    id: number;
    name: string;
    nbMaxParticipants: number;
    nbParticipants: number;
    quizId: number;
    ownerId: number;
    state: 'WAITING' | 'IN_PROGRESS' | 'FINISHED';
    currentQuestionId: number | null;
    questionStartedAt: Date | null;
    questionEndsAt: Date | null;
    createdAt: Date;
  }): Room {
    return {
      id: room.id,
      name: room.name,
      nbMaxParticipants: room.nbMaxParticipants,
      nbParticipants: room.nbParticipants,
      quizId: room.quizId,
      ownerId: room.ownerId,
      state: room.state,
      currentQuestionId: room.currentQuestionId,
      questionStartedAt: room.questionStartedAt?.toISOString() ?? null,
      questionEndsAt: room.questionEndsAt?.toISOString() ?? null,
      createdAt: room.createdAt.toISOString(),
    };
  }
}