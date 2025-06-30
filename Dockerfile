FROM node:20

# LibreOffice를 기본 저장소에서 설치 (GPG 오류 방지)
RUN apt-get update && \
    apt-get install -y libreoffice

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "dist/index.js"] 