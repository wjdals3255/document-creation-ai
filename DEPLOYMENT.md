# 🚀 클라우드 배포 가이드

## Cloudtype 배포 (추천 - 한국 서비스)

### 1. Cloudtype CLI 설치

```bash
npm install -g @cloudtype/cli
```

### 2. Cloudtype 로그인

```bash
cloudtype login
```

### 3. 프로젝트 초기화

```bash
cloudtype init
```

### 4. 프로젝트 배포

```bash
cloudtype deploy
```

### 5. 환경 변수 설정

```bash
cloudtype env set NODE_ENV production
cloudtype env set CORS_ORIGIN https://your-frontend-domain.com
```

### 6. 배포 상태 확인

```bash
cloudtype status
```

### 7. 로그 확인

```bash
cloudtype logs
```

## Vercel 배포 (추천 - 가장 간단)

### 1. Vercel CLI 설치

```bash
npm i -g vercel
```

### 2. Vercel 로그인

```bash
vercel login
```

### 3. 프로젝트 배포

```bash
vercel
```

### 4. 프로덕션 배포

```bash
vercel --prod
```

## Railway 배포

### 1. Railway CLI 설치

```bash
npm i -g @railway/cli
```

### 2. Railway 로그인

```bash
railway login
```

### 3. 프로젝트 배포

```bash
railway init
railway up
```

## Heroku 배포

### 1. Heroku CLI 설치

```bash
# macOS
brew tap heroku/brew && brew install heroku

# 또는 공식 사이트에서 다운로드
```

### 2. Heroku 로그인

```bash
heroku login
```

### 3. Heroku 앱 생성

```bash
heroku create your-app-name
```

### 4. 환경 변수 설정

```bash
heroku config:set NODE_ENV=production
heroku config:set CORS_ORIGIN=https://your-frontend-domain.com
```

### 5. 배포

```bash
git push heroku main
```

## GitHub Actions를 통한 자동 배포

### 1. GitHub 저장소 생성

```bash
git remote add origin https://github.com/yourusername/document-creation-ai.git
git push -u origin main
```

### 2. GitHub Actions 워크플로우 생성

`.github/workflows/deploy.yml` 파일을 생성:

```yaml
name: Deploy to Cloudtype

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: yarn install

      - name: Build
        run: yarn build

      - name: Deploy to Cloudtype
        uses: cloudtype/action@v1
        with:
          token: ${{ secrets.CLOUDTYPE_TOKEN }}
          project: document-creation-ai
```

## 환경 변수 설정

### Cloudtype

1. Cloudtype 대시보드에서 프로젝트 선택
2. Settings > Environment Variables
3. 다음 변수들 추가:
   - `NODE_ENV`: `production`
   - `CORS_ORIGIN`: 프론트엔드 도메인
   - `PORT`: `8080`

### Vercel

1. Vercel 대시보드에서 프로젝트 선택
2. Settings > Environment Variables
3. 다음 변수들 추가:
   - `NODE_ENV`: `production`
   - `CORS_ORIGIN`: 프론트엔드 도메인

### Railway

1. Railway 대시보드에서 프로젝트 선택
2. Variables 탭에서 환경 변수 추가

### Heroku

```bash
heroku config:set NODE_ENV=production
heroku config:set CORS_ORIGIN=https://your-frontend-domain.com
```

## 배포 후 확인

### 1. 헬스 체크

```bash
curl https://your-app.cloudtype.app/health
```

### 2. API 테스트

```bash
curl https://your-app.cloudtype.app/api/v1/documents
```

## 도메인 설정

### 커스텀 도메인 (Cloudtype)

1. Cloudtype 대시보드에서 프로젝트 선택
2. Settings > Domains
3. 도메인 추가 및 DNS 설정

### SSL 인증서

- Cloudtype, Vercel, Railway, Heroku 모두 자동으로 SSL 인증서 제공
- 커스텀 도메인도 자동으로 SSL 적용

## 모니터링

### Cloudtype Analytics

- Cloudtype 대시보드에서 실시간 모니터링
- 함수 실행 시간, 에러율 등 확인

### 로그 확인

```bash
# Cloudtype
cloudtype logs

# Vercel
vercel logs

# Railway
railway logs

# Heroku
heroku logs --tail
```

## 비용

### Cloudtype

- 무료 플랜: 월 100GB 대역폭, 1000 함수 실행
- Pro 플랜: 월 10,000원

### Vercel

- 무료 플랜: 월 100GB 대역폭, 1000 함수 실행
- Pro 플랜: $20/월

### Railway

- 무료 플랜: 월 $5 크레딧
- 유료 플랜: 사용량 기반

### Heroku

- Basic 플랜: $7/월
- Standard 플랜: $25/월

## 추천 배포 순서

1. **개발 단계**: Cloudtype (한국 서비스, 무료)
2. **프로덕션 단계**: Cloudtype Pro 또는 Vercel
3. **대규모 서비스**: AWS/GCP/Azure
