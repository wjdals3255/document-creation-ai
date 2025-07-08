import express from 'express'
import multer from 'multer'
import fs from 'fs'
import cors from 'cors'
import superagent from 'superagent'
import pdfParse from 'pdf-parse'
import { createClient } from '@supabase/supabase-js'
import iconv from 'iconv-lite'

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

app.get('/', (req, res) => {
  res.send('서버가 정상적으로 실행 중입니다.')
})

// 파일 업로드 및 외부 변환 API 호출
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' })
    return
  }

  // 고유 document_id 생성 (timestamp 기반)
  const document_id = Date.now()
  // 한글 파일명 복원 코드 제거, 그대로 저장
  const document_name = req.file.originalname
  // 원본 파일의 서버 내 경로를 retry_url로 저장
  const retry_url = `/uploads/${req.file.filename}`
  const converted_at = new Date().toISOString()

  res.json({ success: true, message: '파일 업로드 완료', document_id })

  // 업로드된 파일명(raw) 로그 출력
  console.log('originalname(raw):', req.file.originalname)
  const filePath = req.file.path
  const originalName = req.file.originalname
  const mimeType = req.file.mimetype
  ;(async () => {
    let status = 'fail',
      converted_file_url = '',
      errorMsg = ''
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
      } else {
        status = 'fail'
        errorMsg = 'pdf_url 없음'
      }
      // n8n Webhook 전송 (실패해도 무관)
      try {
        const n8nWebhookUrl = 'https://n8n-n8n-ce-manidhgw6580ee84.sel4.cloudtype.app/webhook-test/38cc66c9-e609-4b96-84a5-b31ab56a4f67'
        if (pdf_url || txt_url) {
          await superagent.post(n8nWebhookUrl).send({ pdf_url, txt_url })
          console.log('n8n 웹훅으로 변환 결과 전송 완료')
        }
      } catch (e) {
        console.error('n8n Webhook 전송 실패:', e)
      }
    } catch (e: any) {
      status = 'fail'
      errorMsg = e.message
      console.error('외부 변환 API 호출 실패:', e)
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
              retry_url
            }
          ])
          .select()
        if (error) {
          console.error('Supabase 저장 실패:', error, JSON.stringify(error, null, 2))
        } else {
          console.log('Supabase에 변환 결과 저장 완료:', data)
        }
      } catch (dbErr: any) {
        console.error('Supabase 저장 예외 발생:', dbErr)
      }
    }
  })()
})

// 변환 결과 리스트 조회 API
app.get('/convert-results', async (req, res) => {
  const { data, error } = await supabase.from('컨버팅_테이블').select('*').order('converted_at', { ascending: false }).limit(100)
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

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`)
})
