FROM node:22-slim

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

RUN mkdir -p data

ENV PORT=7000
ENV NODE_ENV=production

EXPOSE 7000

CMD ["node", "--experimental-sqlite", "server.js"]
