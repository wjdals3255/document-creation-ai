import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import fs from 'fs'
import dotenv from 'dotenv'
import extractTextRoutes from './routes/extractTextRoutes'

// Load environment variables
dotenv.config()

// Create Express app
const app = express()
app.use(cors())
app.use(helmet())
app.use(morgan('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// uploads 폴더가 없으면 생성
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads')
}

// 헬스체크 및 서버 상태
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Document Creation AI Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      extractText: '/extract-text'
    }
  })
})

// PDF, XLSX, TXT 텍스트 추출 라우트만 사용
app.use('/', extractTextRoutes)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
