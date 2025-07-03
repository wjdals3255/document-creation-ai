FROM node:20-slim

# 시스템 패키지 업데이트 및 LibreOffice, graphicsmagick, ghostscript 설치
RUN apt-get update && \
    apt-get install -y \
    libreoffice \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress && \
    apt-get install -y graphicsmagick ghostscript && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# package.json과 yarn.lock 복사
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false

# 소스 코드 복사
COPY . .

# TypeScript 빌드
RUN yarn build

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=8080
ENV TZ=Asia/Seoul

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

EXPOSE 8080

# Node.js 메모리 및 GC 설정
CMD ["node", "--max-old-space-size=2048", "--max-semi-space-size=512", "dist/index.js"] 