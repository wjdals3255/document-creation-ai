# Document Creation AI Server

공공데이터 문서 자동 변환/추출 서버입니다. 다양한 문서 포맷(HWP, HWPX, PDF, DOCX, XLSX, TXT, CSV 등)에서 텍스트를 추출할 수 있습니다.

## 🚀 주요 기능

### 📄 **지원 파일 형식**

- **HWP** → PDF → 텍스트 추출 (MS Word Mac 연동)
- **HWPX** → 텍스트 추출
- **PDF** → 텍스트 추출 (OCR 지원)
- **DOCX** → 텍스트 추출
- **XLSX** → 텍스트 추출
- **TXT, CSV** → 텍스트 추출

### 🎯 **HWP 파일 처리 방식**

#### **Mac 환경 (권장)**

1. **로컬 MS Word** → AppleScript로 자동 제어
2. **Microsoft Graph API** → 온라인 Word 변환 (fallback)
3. **LibreOffice** → 최종 fallback

#### **다른 환경**

1. **LibreOffice** → HWP → PDF → 텍스트
2. **한컴 API** → HWP → PDF → 텍스트 (fallback)

## 🛠️ 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 설정 (선택사항)

#### **Microsoft Graph API 설정 (Mac 환경에서 더 안정적인 변환을 위해)**

1. [Microsoft Azure Portal](https://portal.azure.com)에서 앱 등록
2. Microsoft Graph API 권한 추가
3. 환경변수 설정:

```bash
# .env 파일 생성
cp env.example .env

# .env 파일 편집
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=your-tenant-id
```

### 3. 서버 실행

```bash
npm run dev
```

서버가 `http://localhost:8080`에서 실행됩니다.

## 📡 API 엔드포인트

### **HWP 텍스트 추출**

```bash
POST /extract-hwp-text
Content-Type: multipart/form-data

# 파일 업로드
curl -X POST http://localhost:8080/extract-hwp-text \
  -F "file=@document.hwp"
```

**응답 예시:**

```json
{
  "success": true,
  "filename": "document.hwp",
  "text": "추출된 텍스트 내용...",
  "textLength": 1234,
  "method": "MS Word (Mac)"
}
```

### **건강 체크**

```bash
GET /health
```

## 🔧 **MS Word 연동 상세 설명**

### **Mac 환경에서 MS Word 사용**

- **AppleScript**를 통해 로컬 MS Word 앱을 자동 제어
- **API 키 불필요** - 로컬 설치된 MS Word만 있으면 동작
- **무료** - 추가 비용 없음
- **정확한 변환** - MS Word의 HWP 지원 활용

### **Microsoft Graph API (선택사항)**

- **온라인 변환** - 서버 환경에서도 동작
- **Microsoft 365 계정** 필요
- **API 키 등록** 필요
- **더 안정적** - 로컬 환경 의존성 없음

### **우선순위**

1. **로컬 MS Word** (Mac)
2. **Microsoft Graph API** (설정된 경우)
3. **LibreOffice** (최종 fallback)

## 🐳 Docker 배포

```bash
# Docker 이미지 빌드
docker build -t document-creation-ai .

# 컨테이너 실행
docker run -p 8080:8080 document-creation-ai
```

## 📝 **환경별 권장사항**

### **개발 환경 (Mac)**

- MS Word 설치
- Microsoft Graph API 설정 (선택사항)

### **프로덕션 환경**

- Microsoft Graph API 설정 권장
- LibreOffice 설치 (fallback용)

### **Docker 환경**

- LibreOffice 기반 변환
- Microsoft Graph API 설정 가능

## 🔍 **문제 해결**

### **포트 충돌**

```bash
# 포트 사용 중인 프로세스 확인
lsof -i :8080

# 프로세스 종료
kill -9 <PID>
```

### **HWP 변환 실패**

1. MS Word가 설치되어 있는지 확인 (Mac)
2. Microsoft Graph API 설정 확인
3. LibreOffice 설치 확인

### **권한 문제**

```bash
# LibreOffice 실행 권한 확인
which soffice
which libreoffice
```

## 📄 **라이선스**

MIT License

## 🤝 **기여**

이슈나 풀 리퀘스트를 환영합니다!
