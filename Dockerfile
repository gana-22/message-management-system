FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

COPY .env.local ./

RUN npm run prebuild

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:local:dev"]