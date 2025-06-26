import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import multer from 'multer'
import dotenv from 'dotenv'
import { extractHwpText } from './extractHwpText'
import { Request, Response, NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import axios from 'axios'

// Load environment variables
dotenv.config()

// Create Express app
const app = express()
const upload = multer({ dest: 'uploads/' })
const PORT = process.env.PORT || 8080

// Middleware
app.use(helmet()) // Security headers
app.use(cors({ origin: '*', credentials: true }))
app.use(morgan('combined')) // Logging
app.use(express.json({ limit: '10mb' })) // Parse JSON bodies
app.use(express.urlencoded({ extended: true })) // Parse URL-encoded bodies

// uploads 폴더가 없으면 자동 생성
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads')
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Document Creation AI Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// HWP 텍스트 추출 API
app.post('/extract-hwp-text', upload.single('data'), async (req: any, res: any) => {
  console.log('==== /extract-hwp-text 호출됨 ====')
  console.log('req.file:', req.file)
  console.log('req.body:', req.body)
  console.log('req.files:', req.files)
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    }
    const filePath = req.file.path
    const text = await extractHwpText(filePath)
    res.json({ text })
  } catch (err: any) {
    res.status(500).json({ error: '텍스트 추출 실패', detail: err.message })
  }
})

// base64 업로드용 HWP 텍스트 추출 API
app.post('/extract-hwp-text-base64', async (req: any, res: any) => {
  try {
    const { data, filename } = req.body
    if (!data) {
      return res.status(400).json({ error: 'data 필드(base64 문자열)가 필요합니다.' })
    }
    // 파일명 지정 (없으면 임시 이름)
    const saveName = filename || `upload_${Date.now()}.hwp`
    const filePath = path.join('uploads', saveName)
    // base64 디코딩 및 파일 저장
    const fileBuffer = Buffer.from(data, 'base64')
    fs.writeFileSync(filePath, fileBuffer)
    // HWP 텍스트 추출
    const text = await extractHwpText(filePath)
    res.json({ text })
  } catch (err: any) {
    res.status(500).json({ error: '텍스트 추출 실패', detail: err.message })
  }
})

// HWP 업로드 → 텍스트 추출 → PDF 변환 및 다운로드
app.post('/extract-hwp-to-pdf', upload.single('data'), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    }
    const filePath = req.file.path
    const text = await extractHwpText(filePath)

    // PDF 생성
    const doc = new PDFDocument()
    const pdfPath = filePath.replace(/\.hwp$/, '.pdf')
    const stream = fs.createWriteStream(pdfPath)
    doc.pipe(stream)
    doc.text(text)
    doc.end()

    stream.on('finish', () => {
      res.download(pdfPath, 'result.pdf', () => {
        fs.unlinkSync(pdfPath)
        fs.unlinkSync(filePath)
      })
    })
  } catch (err: any) {
    res.status(500).json({ error: 'PDF 변환 실패', detail: err.message })
  }
})

// URL로 HWP 파일 다운로드 → 텍스트 추출 → PDF 변환 및 다운로드
app.post('/extract-hwp-to-pdf-from-url', async (req: any, res: any) => {
  try {
    const { url } = req.body
    if (!url) {
      return res.status(400).json({ error: 'url이 필요합니다.' })
    }
    // 파일 다운로드
    const response = await axios.get(url, { responseType: 'arraybuffer' })
    const fileBuffer = Buffer.from(response.data)
    const fileBase64 = fileBuffer.toString('base64') // base64 문자열로 변환
    const fileName = `download_${Date.now()}.hwp`
    const filePath = path.join('uploads', fileName)
    fs.writeFileSync(filePath, fileBuffer)
    // 텍스트 추출 (base64 문자열 전달)
    const text = await extractHwpText(fileBase64)
    // PDF 생성
    const PDFDocument = require('pdfkit')
    const doc = new PDFDocument()
    const pdfPath = filePath.replace(/\.hwp$/, '.pdf')
    const stream = fs.createWriteStream(pdfPath)
    doc.pipe(stream)
    doc.text(text)
    doc.end()
    stream.on('finish', () => {
      res.download(pdfPath, 'result.pdf', () => {
        fs.unlinkSync(pdfPath)
        fs.unlinkSync(filePath)
      })
    })
  } catch (err: any) {
    console.error('PDF 변환 실패:', err)
    res.status(500).json({ error: 'PDF 변환 실패', detail: err.message })
  }
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  })
})

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  })
})

// Start server (Vercel에서는 export만 하면 됨)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`)
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`🔗 Health check: http://localhost:${PORT}/health`)
    console.log(`📄 HWP Extract: http://localhost:${PORT}/extract-hwp-text`)
  })
}

export default app
