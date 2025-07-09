import express from 'express'
import multer from 'multer'
import fs from 'fs'
import cors from 'cors'
import superagent from 'superagent'
import pdfParse from 'pdf-parse'
import { createClient } from '@supabase/supabase-js'
import iconv from 'iconv-lite'
import { v4 as uuidv4 } from 'uuid'

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
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' })
    return
  }

  // 고유 document_id 생성 (timestamp 기반)
  const document_id = Date.now()
  // 업로드된 파일명(raw) 및 Buffer 로그 출력
  console.log('originalname(raw):', req.file.originalname)
  console.log('originalname(buffer):', Buffer.from(req.file.originalname))
  // 한글 파일명 복원 (latin1 → utf8)
  const document_name = require('iconv-lite').decode(Buffer.from(req.file.originalname, 'latin1'), 'utf8')
  console.log('originalname(fixed):', document_name)
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
        retry_url = '' // 변환 성공 시 retry_url 비움
      } else {
        status = 'fail'
        errorMsg = 'pdf_url 없음'
        // 변환 실패 시 retry_url은 public URL 그대로 유지
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
      // 변환 실패 시 retry_url은 public URL 그대로 유지
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      // Supabase에 결과 저장 (성공/실패 모두 기록)
      try {
        const { data, error } = await supabase
          .from('컨버팅 테이블')
          .insert([
            {
              // document_id는 빼고 저장 (auto increment)
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

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`)
})
