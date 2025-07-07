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

  // 2. 비동기로 외부 API 호출
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
    } catch (e: any) {
      console.error('외부 변환 API 호출 실패:', e)
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
  })()
})

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`)
})
