import express from 'express'
import multer from 'multer'
import fs from 'fs'
import cors from 'cors'
import superagent from 'superagent'
import pdfParse from 'pdf-parse'
import { createClient } from '@supabase/supabase-js'
import iconv from 'iconv-lite'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import { OpenAI } from 'openai'
import jwt from 'jsonwebtoken'

const app = express()
const PORT = process.env.PORT || 8080

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
  })
)
app.options('*', cors())

// uploads 폴더가 없으면 생성
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads')
}

const upload = multer({ dest: 'uploads/' })

// Supabase 클라이언트 설정 (환경변수 사용, 기본값 제거)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Supabase 환경변수가 설정되지 않았습니다. SUPABASE_URL, SUPABASE_SERVICE_KEY를 확인하세요.')
}
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const ADMIN_ID = process.env.ADMIN_ID
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-secret-key'

app.post('/login', (req, res) => {
  const { username, password } = req.body
  if (username === ADMIN_ID && password === ADMIN_PASSWORD) {
    // JWT 토큰 발급 (1시간 유효)
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' })
    res.json({ success: true, token })
  } else {
    res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' })
  }
})

const AI_PROMPT = `너는 대한민국 지방자치단체의 공공입찰공고문을 분석하는 AI 문서 분석 도우미야.

아래의 공고문을 읽고, 아래 JSON 포맷에 맞춰 정보를 최대한 정확하고 풍부하게 추출해줘.

- 내용이 공고문에 없으면 null 또는 빈 문자열로 채워줘.
- 금액은 숫자(원화, 정수)로, 날짜는 ISO 8601 포맷(YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm:ss)으로, 전화번호는 '-' 포함 형식으로 출력해줘.
- "2024. 1. 8."처럼 날짜가 한글/점/공백으로 되어 있으면 자동으로 ISO 포맷으로 변환해줘.
- 금액이 한글로 적힌 경우(예: "금 육천오백이십사만...")에도 정수형 숫자로 변환해줘.
- 항목명이 명확히 없더라도 문맥상 추정 가능하면 판단해서 추출해줘(예: “용역기간”이 문장으로 언급된 경우 등).
- 각 조항별로 정보를 최대한 분해해서 명확하게 추출해줘.
- 불필요한 설명 없이 반드시 아래 JSON 포맷만 반환해줘.

### [출력 포맷 예시]
{
  "공고번호": "",
  "공고기관": "",
  "공고유형": "",
  "사업명": "",
  "용역개요": "",
  "용역기간": {
    "착수일": "",
    "종료일": ""
  },
  "기초금액": 0,
  "부가세포함여부": true,
  "입찰방식": "",
  "투찰기간": {
    "시작일시": "",
    "종료일시": ""
  },
  "개찰일시": "",
  "개찰장소": "",
  "입찰자격요건": {
    "소재지요건": "",
    "소프트웨어사업자": false,
    "직접생산확인증명서": "",
    "기술지원확약서필수": false,
    "소기업확인서": false
  },
  "하도급가능여부": "",
  "청렴계약제적용여부": true,
  "임금지불서약서여부": true,
  "안전보건서약서여부": true,
  "입찰보증금": "",
  "계약상대자선정기준": "",
  "예정가격산정방법": "",
  "전자입찰URL": "https://www.g2b.go.kr",
  "문의처": {
    "입찰": {
      "부서": "",
      "담당자": "",
      "연락처": ""
    },
    "과업": {
      "부서": "",
      "담당자": "",
      "연락처": ""
    }
  }
}

- 반드시 위 JSON 구조와 키 이름을 그대로 사용해줘.
- 날짜, 금액, 전화번호 포맷을 반드시 지켜줘.
- 항목별로 최대한 풍부하게 정보를 추출해줘.`

// AI 분석 함수
async function analyzeTextWithAI(text: string): Promise<string> {
  try {
    console.log('OpenAI API 호출 시작...')
    console.log('입력 텍스트 길이:', text.length)
    console.log('OpenAI API 키 확인:', process.env.OPENAI_API_KEY ? '설정됨' : '설정되지 않음')

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: AI_PROMPT },
        { role: 'user', content: `다음 문서를 분석하여 요청된 정보를 JSON 형태로 추출해주세요:\n\n${text}` }
      ],
      temperature: 0.1,
      max_tokens: 3000
      // response_format: { type: "json_object" } // 지원하지 않으므로 제거
    })

    console.log('OpenAI API 응답 받음')
    console.log('응답 choices 개수:', completion.choices.length)

    const result = completion.choices[0]?.message?.content || ''
    console.log('AI 분석 결과 원본:', result)

    return result
  } catch (error) {
    console.error('AI 분석 함수 내부 오류:', error)
    console.error('오류 상세:', JSON.stringify(error, null, 2))
    throw error
  }
}

app.get('/', (req, res) => {
  res.send('서버가 정상적으로 실행 중입니다.')
})

// 파일 업로드 및 외부 변환 API 호출
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' })
    return
  }

  // 고유 document_id 생성 (timestamp 기반)
  const document_id = Date.now()

  // 한글 파일명 복원 (latin1 → utf8)
  const document_name = require('iconv-lite').decode(Buffer.from(req.file.originalname, 'latin1'), 'utf8')
  // console.log('originalname(fixed):', document_name)
  const filePath = req.file.path
  const originalName = req.file.originalname
  const mimeType = req.file.mimetype
  // Storage 업로드 경로 생성 (uuid + 확장자)
  const ext = originalName.split('.').pop()
  const safeFileName = `${uuidv4()}.${ext}`
  const storagePath = `uploads/${safeFileName}`

  // Supabase Storage에 파일 업로드
  let retry_url = ''
  try {
    const fileBuffer = fs.readFileSync(filePath)
    const { data: storageData, error: storageError } = await supabase.storage.from('documents').upload(storagePath, fileBuffer, {
      contentType: mimeType
    })
    if (storageError) {
      console.error('Storage 업로드 실패:', storageError)
    } else {
      retry_url = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${storagePath}`
    }
  } catch (e) {
    console.error('Storage 업로드 예외:', e)
  }

  const converted_at = new Date().toISOString()

  res.json({ success: true, message: '파일 업로드 완료', document_id })
  ;(async () => {
    let status = 'fail',
      converted_file_url = '',
      errorMsg = '',
      extracted_text = '',
      ai_result = ''
    try {
      const apiRes = await superagent
        .post('https://convert.code-x.kr/convert')
        .set('accept', 'application/json')
        .set('Authorization', 'Bearer b5155cd8099763b94bc1e75ac2bfc57d97cf457b55c48405183fcc9d325953df')
        .attach('file', fs.createReadStream(filePath), {
          filename: originalName,
          contentType: mimeType
        })
      console.log('외부 변환 API 응답:', apiRes.body)
      const { pdf_url, txt_url } = apiRes.body.result || {}
      if (pdf_url) {
        status = 'success'
        converted_file_url = pdf_url
        retry_url = '' // 변환 성공 시 retry_url 비움
        // PDF 텍스트 추출
        extracted_text = await extractTextFromPdfUrl(pdf_url)
        console.log('PDF 텍스트 추출 완료, 길이:', extracted_text.length)
        console.log('추출된 텍스트 샘플(앞 200자):', extracted_text.slice(0, 200))

        // AI 분석
        try {
          console.log('AI 분석 시작...')
          ai_result = await analyzeTextWithAI(extracted_text)
          console.log('AI 분석 완료, 결과 길이:', ai_result.length)
          console.log('AI 분석 결과:', ai_result)
        } catch (aiErr) {
          console.error('AI 분석 실패:', aiErr)
          console.error('AI 분석 실패 상세:', JSON.stringify(aiErr, null, 2))
          ai_result = ''
        }
      } else {
        status = 'fail'
        errorMsg = 'pdf_url 없음'
        // 변환 실패 시 retry_url은 public URL 그대로 유지
      }
      // n8n Webhook 연동 코드 완전 제거
    } catch (e: any) {
      status = 'fail'
      errorMsg = e.message
      console.error('외부 변환 API 호출 실패:', e)
      // 변환 실패 시 retry_url은 public URL 그대로 유지
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      // Supabase에 결과 저장 (성공/실패 모두 기록)
      try {
        const { data, error } = await supabase
          .from('컨버팅 테이블')
          .insert([
            {
              converted_at,
              document_name,
              status,
              converted_file_url,
              retry_url,
              extracted_text,
              ai_result
            }
          ])
          .select()
        if (error) {
          console.error('Supabase 저장 실패:', error, JSON.stringify(error, null, 2))
        } else {
          console.log('Supabase에 변환 결과 저장 완료:')
        }
      } catch (dbErr: any) {
        console.error('Supabase 저장 예외 발생:', dbErr)
      }
    }
  })()
})

// 변환 재시도 API
app.post('/retry-convert', async (req, res) => {
  const { document_id } = req.body
  if (!document_id) {
    res.status(400).json({ success: false, message: 'document_id가 필요합니다.' })
    return
  }
  // 기존 row 조회
  const { data, error } = await supabase.from('컨버팅 테이블').select('*').eq('document_id', document_id).single()
  if (error || !data) {
    res.status(404).json({ success: false, message: '해당 document_id의 데이터가 없습니다.' })
    return
  }
  const { retry_url, document_name } = data
  if (!retry_url) {
    res.status(400).json({ success: false, message: 'retry_url이 없습니다. 재시도 불가.' })
    return
  }
  try {
    // 원본 파일 public URL로 변환 API 재호출
    const apiRes = await superagent
      .post('https://convert.code-x.kr/convert')
      .set('accept', 'application/json')
      .set('Authorization', 'Bearer b5155cd8099763b94bc1e75ac2bfc57d97cf457b55c48405183fcc9d325953df')
      .field('file_url', retry_url)
    console.log('재시도 변환 API 응답:', apiRes.body)
    const { pdf_url, txt_url } = apiRes.body.result || {}
    let status = 'fail',
      converted_file_url = '',
      errorMsg = ''
    if (pdf_url) {
      status = 'success'
      converted_file_url = pdf_url
      // 재시도 성공 시 retry_url 비움
      await supabase
        .from('컨버팅 테이블')
        .update({
          status,
          converted_file_url,
          retry_url: ''
        })
        .eq('document_id', document_id)
      res.json({ success: true, message: '재시도 변환 성공', pdf_url })
    } else {
      status = 'fail'
      errorMsg = 'pdf_url 없음'
      // 재시도 실패 시 retry_url 그대로 둠
      await supabase
        .from('컨버팅 테이블')
        .update({
          status,
          converted_file_url: '',
          retry_url
        })
        .eq('document_id', document_id)
      res.status(500).json({ success: false, message: '재시도 변환 실패', error: errorMsg })
    }
  } catch (e) {
    console.error('재시도 변환 API 호출 실패:', e)
    res.status(500).json({ success: false, message: '재시도 변환 API 호출 실패', error: (e as any).message })
  }
})

// 변환 결과 리스트 조회 API
app.get('/convert-results', async (req, res) => {
  const { data, error } = await supabase.from('컨버팅 테이블').select('*').order('converted_at', { ascending: false }).limit(100)
  if (error) {
    res.status(500).json({ success: false, error: error.message })
    return
  }
  res.json({ success: true, results: data })
})

// PDF 파일에서 텍스트 추출 엔드포인트
app.post('/extract-text', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' })
    return
  }
  try {
    const buffer = fs.readFileSync(req.file.path)
    const data = await pdfParse(buffer)
    res.json({ success: true, text: data.text })
  } catch (e: any) {
    res.status(500).json({ success: false, message: '텍스트 추출 실패', detail: e.message })
  } finally {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
  }
})

// PDF URL에서 텍스트 추출 함수
async function extractTextFromPdfUrl(pdfUrl: string) {
  const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' })
  const pdfBuffer = Buffer.from(response.data)
  const data = await pdfParse(pdfBuffer)
  return data.text
}

// PDF URL에서 텍스트 추출 API
app.post('/extract-text-from-url', async (req, res) => {
  const { pdf_url } = req.body
  if (!pdf_url) {
    res.status(400).json({ success: false, message: 'pdf_url이 필요합니다.' })
    return
  }
  try {
    // 1. PDF 파일 다운로드 (Buffer)
    const response = await axios.get(pdf_url, { responseType: 'arraybuffer' })
    const pdfBuffer = Buffer.from(response.data)
    // 2. pdf-parse로 텍스트 추출
    const data = await pdfParse(pdfBuffer)
    console.log('PDF 텍스트 추출 결과(앞 500자):', data.text.slice(0, 500))
    res.json({ success: true, text: data.text })
  } catch (e) {
    console.error('PDF 텍스트 추출 실패:', e)
    res.status(500).json({ success: false, message: 'PDF 텍스트 추출 실패', error: (e as any).message })
  }
})

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`)
})
