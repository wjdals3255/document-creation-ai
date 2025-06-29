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
import fileType from 'file-type'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import XLSX from 'xlsx'
import { exec } from 'child_process'
import hwpxRoutes from './routes/hwpxRoutes'

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

// HWP 텍스트 추출 API (기존 버전)
app.post('/extract-hwp-text', upload.array('data'), async (req: any, res: any) => {
  console.log('==== /extract-hwp-text 호출됨 ====')
  console.log('req.files:', req.files)
  console.log('req.body:', req.body)
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    }
    const results = await Promise.all(
      req.files.map(async (file: any) => {
        try {
          const text = await extractHwpText(file.path)
          return { filename: file.originalname, text }
        } catch (err: any) {
          return { filename: file.originalname, error: err.message }
        }
      })
    )
    res.json({ results })
  } catch (err: any) {
    res.status(500).json({ error: '텍스트 추출 실패', detail: err.message })
  }
})

// HWP 텍스트 추출 API (개선된 버전 - HWP는 DOCX 변환 후 처리)
app.post('/extract-hwp-text-enhanced', upload.array('data'), async (req: any, res: any) => {
  console.log('==== /extract-hwp-text-enhanced 호출됨 ====')
  console.log('req.files:', req.files)
  console.log('req.body:', req.body)
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    }

    const results = await Promise.all(
      req.files.map(async (file: any) => {
        try {
          let text = ''

          // HWP 파일인 경우 DOCX 변환 후 처리
          if (file.originalname.toLowerCase().endsWith('.hwp')) {
            console.log('HWP 파일 감지, DOCX 변환 시도...')
            text = await convertHwpToText(file.path, file.originalname)
          } else {
            // 다른 파일들은 기존 방식으로 처리
            text = await extractHwpText(file.path)
          }

          // HWP 파일이고 텍스트가 비어있거나 실패 메시지인 경우 한컴 API 시도
          if (
            file.originalname.toLowerCase().endsWith('.hwp') &&
            (!text || text.includes('실패') || text.includes('한컴 API') || text.length < 10)
          ) {
            console.log('한컴 API 시도 중...')
            try {
              const fileBuffer = fs.readFileSync(file.path)
              const base64Data = fileBuffer.toString('base64')

              // 한컴 OAuth2 토큰 발급
              const accessToken = await getHancomAccessToken()

              // 한컴 API로 HWP → TXT 변환
              const hancomResult = await hancomHwpToText(fileBuffer, file.originalname, accessToken)

              if (hancomResult && hancomResult.trim()) {
                console.log('한컴 API 성공!')
                text = hancomResult
              } else {
                console.log('한컴 API도 실패')
              }
            } catch (hancomError: any) {
              console.log('한컴 API 에러:', hancomError.message)
            }
          }

          return { filename: file.originalname, text }
        } catch (err: any) {
          return { filename: file.originalname, error: err.message }
        }
      })
    )
    res.json({ results })
  } catch (err: any) {
    res.status(500).json({ error: '텍스트 추출 실패', detail: err.message })
  }
})

// HWP → DOCX → 텍스트 변환 함수
async function convertHwpToText(filePath: string, originalName: string): Promise<string> {
  try {
    console.log('HWP → DOCX 변환 시작:', originalName)
    const docxPath = filePath.replace(/\.hwp$/, '.docx')

    // 방법 1: LibreOffice 사용 (무료, 오픈소스)
    const { exec } = require('child_process')

    return new Promise((resolve, reject) => {
      // macOS에서는 soffice 명령어 사용
      const libreOfficeCmd = process.platform === 'darwin' ? '/Applications/LibreOffice.app/Contents/MacOS/soffice' : 'libreoffice'

      const cmd = `${libreOfficeCmd} --headless --convert-to docx "${filePath}" --outdir "${path.dirname(filePath)}"`
      console.log('LibreOffice 명령어:', cmd)

      exec(cmd, (error: any, stdout: any, stderr: any) => {
        console.log('LibreOffice stdout:', stdout)
        console.log('LibreOffice stderr:', stderr)

        if (error) {
          console.log('LibreOffice 변환 실패:', error.message)
          // 방법 2: Pandoc 사용
          exec(`pandoc "${filePath}" -o "${docxPath}"`, (pandocError: any, pandocStdout: any, pandocStderr: any) => {
            console.log('Pandoc stdout:', pandocStdout)
            console.log('Pandoc stderr:', pandocStderr)

            if (pandocError) {
              console.log('Pandoc 변환도 실패:', pandocError.message)
              // 변환 실패 시 기존 방식으로 fallback
              console.log('기존 extractHwpText 방식으로 fallback')
              extractHwpText(filePath).then(resolve).catch(reject)
              return
            }

            // DOCX 파일이 생성되었는지 확인
            if (fs.existsSync(docxPath)) {
              console.log('Pandoc으로 DOCX 변환 성공')
              processDocxFileForHwp(docxPath, filePath).then(resolve).catch(reject)
            } else {
              console.log('DOCX 파일 생성 실패, 기존 방식으로 fallback')
              extractHwpText(filePath).then(resolve).catch(reject)
            }
          })
        } else {
          // LibreOffice 변환 성공
          console.log('LibreOffice로 DOCX 변환 성공')
          const generatedDocxPath = filePath.replace(/\.hwp$/, '.docx')
          if (fs.existsSync(generatedDocxPath)) {
            console.log('생성된 DOCX 파일:', generatedDocxPath)
            processDocxFileForHwp(generatedDocxPath, filePath).then(resolve).catch(reject)
          } else {
            console.log('DOCX 파일을 찾을 수 없음, 기존 방식으로 fallback')
            extractHwpText(filePath).then(resolve).catch(reject)
          }
        }
      })
    })
  } catch (conversionError: any) {
    console.log('변환 중 오류:', conversionError.message)
    // 변환 실패 시 기존 방식으로 fallback
    return extractHwpText(filePath)
  }
}

// HWP용 DOCX 파일 처리 함수
async function processDocxFileForHwp(docxPath: string, originalFilePath: string): Promise<string> {
  try {
    const docxBuffer = fs.readFileSync(docxPath)
    const result = await mammoth.extractRawText({ buffer: docxBuffer })
    const text = result.value.trim()

    // 임시 파일들 정리
    try {
      fs.unlinkSync(docxPath)
    } catch (e) {
      console.log('DOCX 파일 삭제 실패:', e)
    }

    console.log('HWP → DOCX → 텍스트 변환 성공, 길이:', text.length)
    return text
  } catch (docxError: any) {
    console.log('DOCX 처리 실패:', docxError.message)
    // DOCX 처리 실패 시 기존 방식으로 fallback
    return extractHwpText(originalFilePath)
  }
}

// Hancom OAuth2 토큰 발급 함수
async function getHancomAccessToken() {
  const clientId = '5WRG3mFySToKYS4CkoqB'
  const clientSecret = 'slfUCDJ4s3'
  const tokenUrl = 'https://api.hancomdocs.com/oauth2/token'

  const params = new URLSearchParams()
  params.append('grant_type', 'client_credentials')
  params.append('client_id', clientId)
  params.append('client_secret', clientSecret)

  const res = await axios.post(tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  return res.data.access_token
}

// Hancom HWP → TXT 변환 함수
async function hancomHwpToText(fileBuffer: Buffer, filename: string, accessToken: string) {
  const apiUrl = 'https://api.hancomdocs.com/v1.0/convert/txt'
  const res = await axios.post(apiUrl, fileBuffer, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      Accept: 'application/json'
    },
    params: { fileName: filename }
  })
  return res.data // 변환된 텍스트
}

// base64 업로드용 HWP 텍스트 추출 API (한컴 API 연동)
app.post('/extract-hwp-text-base64', async (req: any, res: any) => {
  try {
    const { data, filename } = req.body
    if (!data) {
      return res.status(400).json({ error: 'data 필드(base64 문자열)가 필요합니다.' })
    }
    const saveName = filename || `upload_${Date.now()}.hwp`
    const fileBuffer = Buffer.from(data, 'base64')

    // 1. 한컴 OAuth2 토큰 발급
    const accessToken = await getHancomAccessToken()

    // 2. 한컴 API로 HWP → TXT 변환
    const hancomResult = await hancomHwpToText(fileBuffer, saveName, accessToken)

    // 3. 결과 반환
    res.json({ text: hancomResult })
  } catch (err: any) {
    console.error('extract-hwp-text-base64 한컴 API 에러 상세:', err?.response?.data || err)
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

// URL로 HWP 파일 다운로드 → 텍스트 추출 → 텍스트 반환
app.post('/extract-hwp-text-from-url', async (req: any, res: any) => {
  try {
    const { url } = req.body
    if (!url) {
      return res.status(400).json({ error: 'url이 필요합니다.' })
    }
    // 파일 다운로드
    const response = await axios.get(url, { responseType: 'arraybuffer' })
    const fileBuffer = Buffer.from(response.data)
    const fileName = `download_${Date.now()}`
    const fileTypeResult = await fileType.fromBuffer(fileBuffer)
    console.log('fileTypeResult:', fileTypeResult) // file-type 결과 로그
    let ext = fileTypeResult ? (fileTypeResult.ext as string) : ''
    let text = ''
    let filePath = ''
    // HWP: file-type이 hwp/cfb로 인식하거나, url/파일명에 .hwp가 포함되어 있으면 시도
    if (
      ext === 'hwp' ||
      ext === 'cfb' ||
      url.toLowerCase().includes('.hwp') ||
      (req.body.name && req.body.name.toLowerCase().includes('.hwp'))
    ) {
      filePath = path.join('uploads', fileName + '.hwp')
      fs.writeFileSync(filePath, fileBuffer)

      try {
        // 1. 먼저 hwp.js로 직접 파싱 시도
        console.log('hwp.js로 직접 파싱 시도...')
        const hwp = require('hwp.js')
        const hwpText = await hwp.parse(fileBuffer.toString('base64'))
        text = hwpText
        console.log('hwp.js 파싱 성공')

        // 임시 파일 정리
        fs.unlinkSync(filePath)
      } catch (hwpError) {
        console.error('hwp.js 파싱 실패:', hwpError)

        try {
          // 2. hwp.js 실패 시 LibreOffice로 PDF 변환 시도
          console.log('LibreOffice 변환 시도...')
          const pdfPath = path.join('uploads', fileName + '.pdf')
          console.log(`LibreOffice 변환 시작: ${filePath} -> ${pdfPath}`)

          await new Promise((resolve, reject) => {
            // 더 자세한 옵션으로 LibreOffice 실행
            const cmd = `soffice --headless --convert-to pdf:writer_pdf_Export "${filePath}" --outdir "uploads" 2>&1`
            console.log(`실행 명령어: ${cmd}`)

            exec(cmd, (error, stdout, stderr) => {
              console.log(`LibreOffice stdout: ${stdout}`)
              console.log(`LibreOffice stderr: ${stderr}`)

              if (error) {
                console.error(`LibreOffice 에러: ${error.message}`)
                return reject(error)
              }

              // PDF 파일이 실제로 생성되었는지 확인
              if (!fs.existsSync(pdfPath)) {
                console.error(`PDF 파일이 생성되지 않음: ${pdfPath}`)
                return reject(new Error('PDF 파일이 생성되지 않았습니다.'))
              }

              console.log(`PDF 변환 성공: ${pdfPath}`)
              resolve(true)
            })
          })

          // 3. PDF에서 텍스트 추출
          const pdfBuffer = fs.readFileSync(pdfPath)
          text = (await pdfParse(pdfBuffer)).text

          if (!text || text.trim().length === 0) {
            console.warn('PDF에서 추출된 텍스트가 비어있습니다.')
            text = '텍스트를 추출할 수 없습니다. (빈 문서이거나 변환 실패)'
          }

          // 4. 임시 파일 정리
          fs.unlinkSync(filePath)
          fs.unlinkSync(pdfPath)
        } catch (libreOfficeError) {
          console.error('LibreOffice 변환도 실패:', libreOfficeError)

          // 임시 파일 정리
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
          const pdfPath = path.join('uploads', fileName + '.pdf')
          if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath)

          // 5. 최종 대안: 파일을 그대로 텍스트로 읽어보기
          try {
            console.log('모든 방법 실패, 최종 대안 시도...')
            const alternativeText = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 10000))
            if (alternativeText && alternativeText.trim().length > 0) {
              text = `[변환 실패 - 원본 데이터 일부]\n${alternativeText.substring(0, 1000)}...`
            } else {
              text = 'HWP 파일을 텍스트로 변환할 수 없습니다. 모든 변환 방법이 실패했습니다.'
            }
          } catch (altErr) {
            console.error('최종 대안 방법도 실패:', altErr)
            text = 'HWP 파일을 텍스트로 변환할 수 없습니다. 모든 변환 방법이 실패했습니다.'
          }

          return res.status(400).json({
            error: 'HWP 파일 변환에 실패했습니다.',
            detail: `hwp.js: ${(hwpError as any).message}, LibreOffice: ${(libreOfficeError as any).message}`,
            text: text // 부분적으로라도 텍스트가 있으면 반환
          })
        }
      }
    } else if (ext === 'pdf') {
      // PDF
      text = (await pdfParse(fileBuffer)).text
    } else if (ext === 'docx') {
      // DOCX
      filePath = path.join('uploads', fileName + '.docx')
      fs.writeFileSync(filePath, fileBuffer)
      const result = await mammoth.extractRawText({ path: filePath })
      text = result.value
      fs.unlinkSync(filePath)
    } else if (ext === 'xlsx') {
      // XLSX
      filePath = path.join('uploads', fileName + '.xlsx')
      fs.writeFileSync(filePath, fileBuffer)
      const workbook = XLSX.readFile(filePath)
      let xlsxText = ''
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName]
        const sheetText = XLSX.utils.sheet_to_csv(worksheet)
        xlsxText += sheetText + '\n'
      })
      text = xlsxText
      fs.unlinkSync(filePath)
    } else if (ext === 'txt') {
      // TXT
      text = fileBuffer.toString('utf-8')
    } else {
      return res.status(400).json({ error: '지원하지 않는 파일 형식입니다.' })
    }
    res.json({ text })
  } catch (err: any) {
    console.error('텍스트 추출 실패:', err)
    res.status(500).json({ error: '텍스트 추출 실패', message: err.message, stack: err.stack, detail: err })
  }
})

// HWP → DOCX 변환 후 텍스트 추출 API
app.post('/convert-hwp-to-docx', upload.single('data'), async (req: any, res: any) => {
  console.log('==== /convert-hwp-to-docx 호출됨 ====')
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    }

    const filePath = req.file.path
    const originalName = req.file.originalname
    const docxPath = filePath.replace(/\.hwp$/, '.docx')

    console.log('HWP → DOCX 변환 시작:', originalName)

    try {
      // 방법 1: LibreOffice 사용 (무료, 오픈소스)
      const { exec } = require('child_process')

      // LibreOffice 설치 확인 및 변환
      exec(
        `libreoffice --headless --convert-to docx "${filePath}" --outdir "${path.dirname(filePath)}"`,
        (error: any, stdout: any, stderr: any) => {
          if (error) {
            console.log('LibreOffice 변환 실패:', error.message)
            // 방법 2: Pandoc 사용
            exec(`pandoc "${filePath}" -o "${docxPath}"`, (pandocError: any, pandocStdout: any, pandocStderr: any) => {
              if (pandocError) {
                console.log('Pandoc 변환도 실패:', pandocError.message)
                return res.status(500).json({
                  error: 'HWP → DOCX 변환에 실패했습니다. LibreOffice 또는 Pandoc이 필요합니다.',
                  detail: '서버에 LibreOffice 또는 Pandoc을 설치해주세요.'
                })
              }

              // DOCX 파일이 생성되었는지 확인
              if (fs.existsSync(docxPath)) {
                console.log('Pandoc으로 DOCX 변환 성공')
                processDocxFile(docxPath, res, filePath)
              } else {
                res.status(500).json({ error: 'DOCX 파일 생성에 실패했습니다.' })
              }
            })
          } else {
            // LibreOffice 변환 성공
            console.log('LibreOffice로 DOCX 변환 성공')
            const generatedDocxPath = filePath.replace(/\.hwp$/, '.docx')
            if (fs.existsSync(generatedDocxPath)) {
              processDocxFile(generatedDocxPath, res, filePath)
            } else {
              res.status(500).json({ error: 'DOCX 파일을 찾을 수 없습니다.' })
            }
          }
        }
      )
    } catch (conversionError: any) {
      console.log('변환 중 오류:', conversionError.message)
      res.status(500).json({ error: '변환 중 오류가 발생했습니다.', detail: conversionError.message })
    }
  } catch (err: any) {
    res.status(500).json({ error: 'HWP → DOCX 변환 실패', detail: err.message })
  }
})

// DOCX 파일 처리 함수
async function processDocxFile(docxPath: string, res: any, originalFilePath: string) {
  try {
    const docxBuffer = fs.readFileSync(docxPath)
    const result = await mammoth.extractRawText({ buffer: docxBuffer })
    const text = result.value.trim()

    // 임시 파일들 정리
    fs.unlinkSync(docxPath)
    fs.unlinkSync(originalFilePath)

    res.json({
      success: true,
      text: text,
      message: 'HWP → DOCX → 텍스트 변환 성공'
    })
  } catch (docxError: any) {
    console.log('DOCX 처리 실패:', docxError.message)
    res.status(500).json({ error: 'DOCX 파일 처리에 실패했습니다.', detail: docxError.message })
  }
}

app.use(hwpxRoutes)

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
