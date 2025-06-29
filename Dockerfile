FROM node:20

# 시스템 패키지 업데이트 및 LibreOffice 설치
RUN apt-get update && \
    apt-get install -y \
    wget \
    gnupg2 \
    software-properties-common \
    && wget -qO- https://download.documentfoundation.org/libreoffice/keys/libreoffice-keys.gpg | apt-key add - \
    && add-apt-repository "deb https://download.documentfoundation.org/libreoffice/stable/deb/ $(lsb_release -cs) main" \
    && apt-get update \
    && apt-get install -y \
    libreoffice \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# LibreOffice 설치 확인 및 PATH 설정
RUN libreoffice --version && \
    echo "LibreOffice 설치 완료" && \
    which libreoffice || echo "LibreOffice PATH 확인 필요"

# LibreOffice 심볼릭 링크 생성 (필요한 경우)
RUN ln -sf /usr/bin/libreoffice /usr/local/bin/libreoffice || echo "심볼릭 링크 생성 완료"

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

CMD ["node", "dist/index.js"] 