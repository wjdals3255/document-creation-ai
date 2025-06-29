FROM node:20

# 시스템 패키지 업데이트 및 LibreOffice 설치
RUN apt-get update && \
    apt-get install -y \
    libreoffice \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# LibreOffice 설치 확인
RUN libreoffice --version || echo "LibreOffice 설치 확인"

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

CMD ["node", "dist/index.js"] 