import express from 'express'
import multer from 'multer'
import fs from 'fs'
import cors from 'cors'
import superagent from 'superagent'

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

app.get('/', (req, res) => {
  res.send('서버가 정상적으로 실행 중입니다.')
})

// 파일 업로드 및 외부 변환 API 호출
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' })
    return
  }

  // 1. 클라이언트에 즉시 응답
  res.json({ success: true, message: '파일 업로드 완료' })

  // 2. 비동기로 외부 API 호출 및 n8n 웹훅 전송
  const filePath = req.file.path
  const originalName = req.file.originalname
  const mimeType = req.file.mimetype
  ;(async () => {
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

      // 변환 결과를 n8n 웹훅으로 POST
      const n8nWebhookUrl = 'https://n8n-n8n-ce-manidhgw6580ee84.sel4.cloudtype.app/webhook-test/38cc66c9-e609-4b96-84a5-b31ab56a4f67'
      const { pdf_url, txt_url } = apiRes.body.result || {}
      if (pdf_url || txt_url) {
        await superagent.post(n8nWebhookUrl).send({ pdf_url, txt_url })
        console.log('n8n 웹훅으로 변환 결과 전송 완료')
      } else {
        console.log('변환 결과에 pdf_url, txt_url이 없습니다.')
      }
    } catch (e: any) {
      console.error('외부 변환 API 호출 또는 n8n 웹훅 전송 실패:', e)
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
  })()
})

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`)
})
