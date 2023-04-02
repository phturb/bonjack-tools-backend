FROM node:alpine as builder
WORKDIR /app

COPY package*.json ./

RUN npm install -g typescript ts-node

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

FROM node:alpine
ENV NODE_ENV production
USER node

COPY package*.json ./

RUN npm ci --production

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/app.js"]
