# 공공데이터 문서 생성 AI 서버

Node.js Express와 TypeScript로 구축된 공공데이터 문서 생성 서버입니다.

## 🚀 기능

- 문서 CRUD 작업 (생성, 조회, 수정, 삭제)
- RESTful API
- TypeScript 지원
- CORS 설정
- 보안 헤더 (Helmet)
- 로깅 (Morgan)
- 에러 핸들링

## 📋 요구사항

- Node.js 16+
- Yarn

## 🛠️ 설치 및 실행

### 1. 의존성 설치

```bash
yarn install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# API Configuration
API_PREFIX=/api/v1

# Logging
LOG_LEVEL=info
```

### 3. 개발 서버 실행

```bash
yarn dev
```

### 4. 프로덕션 빌드

```bash
yarn build
yarn start
```

## 📚 API 문서

### 기본 URL

```
http://localhost:3000/api/v1
```

### 엔드포인트

#### 1. 헬스 체크

```
GET /health
```

#### 2. 문서 관리

**모든 문서 조회**

```
GET /api/v1/documents
```

**특정 문서 조회**

```
GET /api/v1/documents/:id
```

**새 문서 생성**

```
POST /api/v1/documents
Content-Type: application/json

{
  "title": "문서 제목",
  "content": "문서 내용",
  "type": "general",
  "status": "draft",
  "metadata": {
    "author": "작성자",
    "department": "부서",
    "tags": ["태그1", "태그2"]
  }
}
```

**문서 수정**

```
PUT /api/v1/documents/:id
Content-Type: application/json

{
  "title": "수정된 제목",
  "content": "수정된 내용"
}
```

**문서 삭제**

```
DELETE /api/v1/documents/:id
```

## 📁 프로젝트 구조

```
src/
├── controllers/     # 컨트롤러
├── middleware/      # 미들웨어
├── routes/          # 라우터
├── types/           # TypeScript 타입 정의
├── utils/           # 유틸리티 함수
└── index.ts         # 메인 진입점
```

## 🔧 개발

### 스크립트

- `yarn dev`: 개발 서버 실행 (nodemon)
- `yarn build`: TypeScript 컴파일
- `yarn start`: 프로덕션 서버 실행
- `yarn clean`: 빌드 파일 정리

### 코드 스타일

- TypeScript strict 모드 사용
- ESLint 규칙 준수
- 일관된 네이밍 컨벤션

## 🔒 보안

- Helmet을 통한 보안 헤더 설정
- CORS 설정
- 입력 데이터 유효성 검사
- 에러 핸들링

## 📝 TODO

- [ ] 데이터베이스 연동 (MongoDB/PostgreSQL)
- [ ] 인증/인가 시스템
- [ ] 파일 업로드 기능
- [ ] 문서 템플릿 기능
- [ ] API 문서화 (Swagger)
- [ ] 테스트 코드 작성
- [ ] Docker 설정

## 🤝 기여

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이선스

MIT License
