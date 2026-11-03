FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm install -w @quizz/shared -w @quizz/web
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @quizz/shared && npm run build -w @quizz/web

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
