import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class QuizService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const existingQuiz = await this.prisma.quiz.findFirst();
    if (existingQuiz) {
      return;
    }

    await this.prisma.quiz.create({
      data: {
        title: 'Quiz de test',
        createur: 'admin',
        questions: {
          create: [
            {
              question: 'Quelle est la capitale de la France ?',
              answers: {
                create: [
                  { enonce: 'Paris', isTrue: true },
                  { enonce: 'Lyon', isTrue: false },
                  { enonce: 'Marseille', isTrue: false },
                ],
              },
            },
            {
              question: 'Combien font 2 + 2 ?',
              answers: {
                create: [
                  { enonce: '3', isTrue: false },
                  { enonce: '4', isTrue: true },
                  { enonce: '5', isTrue: false },
                ],
              },
            },
          ],
        },
      },
    });
  }
}

