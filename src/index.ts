import express from 'express'
import multer from 'multer'
import fs from 'fs'
import cors from 'cors'
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

app.get('/', (req, res) => {
  res.send('서버가 정상적으로 실행 중입니다.')
})

// 파일 업로드 엔드포인트
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' })
    return
  }
  let originalName = req.file.originalname
  // 한글 파일명 복원 시도
  try {
    originalName = iconv.decode(Buffer.from(originalName, 'binary'), 'utf-8')
  } catch (e) {
    // 실패해도 무시
  }
  res.json({
    success: true,
    filename: originalName,
    savedFilename: req.file.filename,
    path: `/uploads/${req.file.filename}`
  })
})

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`)
})
