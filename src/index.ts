import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import multer from 'multer'
import dotenv from 'dotenv'
import { extractHwpText } from './extractHwpText'
import { Request, Response, NextFunction } from 'express'

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
app.post('/extract-hwp-text', upload.single('data'), async (req: Request, res: Response) => {
  const filePath = (req.file as Express.Multer.File).path
  try {
    const text = await extractHwpText(filePath)
    res.json({ text })
  } catch (err: any) {
    res.status(500).json({ error: '텍스트 추출 실패', detail: err.message })
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
