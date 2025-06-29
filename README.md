# Document Creation AI Server

Node.js + TypeScript로 구축된 공공데이터 문서 자동 변환/추출 서버입니다.

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
PORT=8080
NODE_ENV=production

# CORS Configuration
CORS_ORIGIN=https://your-frontend-domain.com

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
http://localhost:8080/api/v1
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

## 지원 파일 형식

- **HWP**: 한글 문서 (HWP → DOCX 변환 후 처리)
- **DOCX**: Word 문서
- **PDF**: PDF 문서 (이미지 PDF는 OCR 필요)
- **XLSX**: Excel 문서
- **TXT/CSV**: 텍스트 파일
- **HWPX**: 한글 문서 (XML 기반)

## 서버 설정

### HWP → DOCX 변환을 위한 도구 설치

#### 1. LibreOffice 설치 (권장)

**macOS:**

```bash
brew install --cask libreoffice
```

**Ubuntu/Debian:**

```bash
sudo apt-get update
sudo apt-get install libreoffice
```

**CentOS/RHEL:**

```bash
sudo yum install libreoffice
```

#### 2. Pandoc 설치 (대안)

**macOS:**

```bash
brew install pandoc
```

**Ubuntu/Debian:**

```bash
sudo apt-get install pandoc
```

**CentOS/RHEL:**

```bash
sudo yum install pandoc
```

### 설치 확인

```bash
# LibreOffice 확인
libreoffice --version

# Pandoc 확인
pandoc --version
```

## API 엔드포인트

### 1. 기본 텍스트 추출

```
POST /extract-hwp-text
POST /extract-hwp-text-enhanced
```

### 2. HWP → DOCX 변환 후 텍스트 추출 (새로 추가)

```
POST /convert-hwp-to-docx
```

**사용법:**

```bash
curl -X POST -F "data=@document.hwp" http://localhost:8080/convert-hwp-to-docx
```

**응답:**

```json
{
  "success": true,
  "text": "변환된 텍스트 내용...",
  "message": "HWP → DOCX → 텍스트 변환 성공"
}
```

### 3. 기타 엔드포인트

```
POST /extract-hwp-text-base64
POST /extract-hwp-to-pdf
POST /extract-hwp-text-from-url
GET /health
```

## 배포

### Cloudtype 배포

```bash
npm install -g @cloudtype/cli
cloudtype login
cloudtype deploy
```

### Docker 배포

```bash
docker build -t document-creation-ai .
docker run -p 8080:8080 document-creation-ai
```

## 문제 해결

### HWP 파일 처리 문제

1. **깨진 한글**: HWP → DOCX 변환 엔드포인트 사용
2. **변환 실패**: LibreOffice 또는 Pandoc 설치 확인
3. **한컴 API**: 서비스 복구 대기 중

### PDF 텍스트 추출 실패

- 이미지 기반 PDF의 경우 OCR 필요
- GPT-4o 등 OCR 서비스 활용 권장
