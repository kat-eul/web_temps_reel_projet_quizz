import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existingQuiz = await prisma.quiz.findFirst();
  if (existingQuiz) {
    console.log('Quiz seeds already exist.');
    return;
  }

  await prisma.quiz.create({
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

  console.log('Quiz seed created successfully.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

