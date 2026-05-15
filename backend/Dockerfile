FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

RUN mkdir -p uploads/bols uploads

EXPOSE 5004

CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node server.js"]
