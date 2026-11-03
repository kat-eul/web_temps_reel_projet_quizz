FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install -w @quizz/shared -w @quizz/api
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @quizz/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @quizz/api
ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
