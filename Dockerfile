FROM node:20

# LibreOffice 설치
RUN apt-get update && \
    apt-get install -y libreoffice && \
    apt-get clean

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

CMD ["node", "dist/index.js"] 