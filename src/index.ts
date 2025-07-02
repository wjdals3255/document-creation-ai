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
import CloudConvert from 'cloudconvert'

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
app.use(express.json({ limit: '50mb' })) // Parse JSON bodies (50MB로 상향)
app.use(express.urlencoded({ extended: true, limit: '50mb' })) // Parse URL-encoded bodies (50MB로 상향)

// uploads 폴더가 없으면 자동 생성
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads')
}

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Document Creation AI Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      extractHwpText: '/extract-hwp-text',
      extractHwpTextEnhanced: '/extract-hwp-text-enhanced',
      convertHwpToPdfCloudConvert: '/convert-hwp-to-pdf-cloudconvert',
      printHwpToPdf: '/print-hwp-to-pdf'
    }
  })
})

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
app.post('/extract-hwp-text', upload.single('file'), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    }

    const fileBuffer = req.file.buffer
    const filename = req.file.originalname

    console.log(`HWP 파일 업로드됨: ${filename}, 크기: ${fileBuffer.length} bytes`)

    // OS에 따른 적절한 변환 방법 선택
    const extractedText = await convertHwpToTextViaAppropriateMethod(fileBuffer, filename)

    res.json({
      success: true,
      filename: filename,
      text: extractedText,
      textLength: extractedText.length,
      method: isMacOS() ? 'MS Word (Mac)' : 'LibreOffice'
    })
  } catch (error: any) {
    console.error('HWP 텍스트 추출 실패:', error)
    res.status(500).json({
      error: 'HWP 텍스트 추출에 실패했습니다.',
      details: error.message
    })
  }
})

// HWP 텍스트 추출 API (개선된 버전 - HWP는 DOCX 변환 후 처리)
app.post('/extract-hwp-text-enhanced', upload.single('data'), async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
  }
  const ext = path.extname(req.file.originalname).toLowerCase()
  const filePath = req.file.path
  const uploadsDir = 'uploads'

  if (ext === '.hwp') {
    try {
      // 1. 한컴 OAuth2 토큰 발급
      const accessToken = await getHancomAccessToken()
      // 2. HWP → PDF 변환
      const pdfBuffer = await hancomHwpToPdf(filePath, accessToken)
      // 3. PDF 파일로 저장
      const pdfPath = filePath.replace(/\.hwp$/, '.pdf')
      fs.writeFileSync(pdfPath, pdfBuffer)
      // 4. 원본 HWP 파일 삭제
      fs.unlinkSync(filePath)
      // 5. PDF 파일 다운로드
      res.download(pdfPath, path.basename(pdfPath), (err: any) => {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath)
        if (err) {
          console.error('[한컴API] PDF 다운로드 중 오류:', err)
        }
      })
    } catch (err: any) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return res.status(500).json({ error: 'HWP → PDF 변환 실패(한컴API)', detail: err.message, file: req.file.originalname })
    }
  } else {
    // 나머지 파일은 원본 그대로 전송
    res.download(filePath, req.file.originalname, (err: any) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      if (err) {
        console.error('파일 다운로드 중 오류:', err)
      }
    })
  }
})

// hwp.js 파싱 결과에서 본문 텍스트만 추출하는 함수 (개선된 버전)
function extractTextFromHwpJson(hwpJson: any): string {
  let result: string[] = []

  // hwp.js 파싱 결과 구조에 따라 본문 텍스트 추출
  if (hwpJson && typeof hwpJson === 'object') {
    // 구조 1: bodyText.sections 구조
    if (hwpJson.bodyText && Array.isArray(hwpJson.bodyText.sections)) {
      hwpJson.bodyText.sections.forEach((section: any) => {
        if (section.paragraphs && Array.isArray(section.paragraphs)) {
          section.paragraphs.forEach((para: any) => {
            if (para.text && typeof para.text === 'string') {
              result.push(para.text.trim())
            }
          })
        }
      })
    }

    // 구조 2: sections 구조 (직접 접근)
    else if (hwpJson.sections && Array.isArray(hwpJson.sections)) {
      hwpJson.sections.forEach((section: any) => {
        // 문단 텍스트 추출
        if (section.paragraphs && Array.isArray(section.paragraphs)) {
          section.paragraphs.forEach((para: any) => {
            if (para.text && typeof para.text === 'string') {
              result.push(para.text.trim())
            }
          })
        }

        // 텍스트 블록 추출
        if (section.texts && Array.isArray(section.texts)) {
          section.texts.forEach((textBlock: any) => {
            if (textBlock.text && typeof textBlock.text === 'string') {
              result.push(textBlock.text.trim())
            }
          })
        }

        // 기타 텍스트 필드들 확인
        Object.keys(section).forEach((key) => {
          const value = section[key]
          if (typeof value === 'string' && value.trim() && value.length > 5) {
            // 한글이 포함된 텍스트만 추가
            if (/[가-힣]/.test(value)) {
              result.push(value.trim())
            }
          }
        })
      })
    }

    // 구조 3: 직접 텍스트 필드
    else if (hwpJson.text && typeof hwpJson.text === 'string') {
      result.push(hwpJson.text.trim())
    }

    // 구조 4: content 또는 body 필드
    else if (hwpJson.content && typeof hwpJson.content === 'string') {
      result.push(hwpJson.content.trim())
    } else if (hwpJson.body && typeof hwpJson.body === 'string') {
      result.push(hwpJson.body.trim())
    }

    // 구조 5: 재귀적으로 모든 문자열 필드 찾기 (마지막 수단)
    else {
      const extractTextRecursively = (obj: any): string[] => {
        const texts: string[] = []

        if (typeof obj === 'string' && obj.trim() && obj.length > 5) {
          // 한글이 포함된 텍스트만 추가
          if (/[가-힣]/.test(obj)) {
            texts.push(obj.trim())
          }
        } else if (Array.isArray(obj)) {
          obj.forEach((item) => {
            texts.push(...extractTextRecursively(item))
          })
        } else if (typeof obj === 'object' && obj !== null) {
          Object.values(obj).forEach((value) => {
            texts.push(...extractTextRecursively(value))
          })
        }

        return texts
      }

      result = extractTextRecursively(hwpJson)
    }
  }

  // 결과 정리: 중복 제거, 빈 문자열 제거, 의미있는 텍스트만 유지
  const cleanedResult = result
    .filter((text) => text && text.trim() && text.length > 3) // 최소 3자 이상
    .filter((text) => /[가-힣]/.test(text)) // 한글이 포함된 텍스트만
    .filter((text, index, arr) => arr.indexOf(text) === index) // 중복 제거
    .map((text) => text.trim())

  return cleanedResult.join('\n')
}

// HWP 텍스트 후처리 함수 (깨진 텍스트 정리)
function cleanHwpText(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') {
    return ''
  }

  console.log('원본 HWP 텍스트 길이:', rawText.length)
  console.log('원본 HWP 텍스트 샘플:', rawText.substring(0, 200))

  // 1단계: 기본 정리
  let cleaned = rawText
    // 바이너리/인코딩 관련 패턴 제거
    .replace(/[A-Za-z0-9]{20,}/g, ' ') // 20자 이상의 연속된 영숫자 제거
    .replace(/[0-9A-Fa-f]{8,}/g, ' ') // 8자 이상의 16진수 패턴 제거
    .replace(/[A-Za-z]{3,}\s+[A-Za-z]{3,}/g, ' ') // 연속된 영문 단어 제거
    .replace(/[A-Za-z0-9]{5,}[^가-힣\s]{5,}/g, ' ') // 한글이 아닌 연속된 문자 제거
    // 특수문자 및 기호 정리
    .replace(/[^\w\s가-힣.,!?;:()[\]{}"'\-]/g, ' ')
    .replace(/\s+/g, ' ') // 연속된 공백을 하나로
    .trim()

  // 2단계: 한글 문장 추출
  const sentences = cleaned
    .split(/[.!?]/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      if (sentence.length < 10) return false // 너무 짧은 문장 제거

      // 한글 문자가 충분히 포함된 문장만 유지
      const koreanChars = sentence.match(/[가-힣]/g)
      if (!koreanChars || koreanChars.length < 3) return false

      // 깨진 한글 패턴 제거 (자음/모음만 있는 경우)
      const brokenKoreanPattern = /[ㄱ-ㅎㅏ-ㅣ]{3,}/g
      if (brokenKoreanPattern.test(sentence)) return false

      // 의미있는 한글 단어가 포함된 문장만 유지
      const meaningfulKoreanWords = sentence.match(/[가-힣]{2,}/g)
      if (!meaningfulKoreanWords || meaningfulKoreanWords.length < 1) return false

      return true
    })

  // 3단계: 결과 정리
  const result = sentences
    .filter((sentence, index, arr) => arr.indexOf(sentence) === index) // 중복 제거
    .join('. ')
    .trim()

  console.log('정리된 HWP 텍스트 길이:', result.length)
  console.log('정리된 HWP 텍스트 샘플:', result.substring(0, 200))

  return result
}

// HWP → DOCX → 텍스트 변환 함수
async function convertHwpToText(filePath: string, originalName: string): Promise<string> {
  try {
    console.log('HWP → DOCX 변환 시작:', originalName)

    // 1. LibreOffice 자동 변환 시도 (우선)
    console.log('LibreOffice 자동 변환 시도...')
    const isLibreOfficeInstalled = true

    if (isLibreOfficeInstalled) {
      console.log('LibreOffice 설치 확인됨, 변환 시도...')
      const docxPath = await convertHwpToDocxWithLibreOffice(filePath)

      if (docxPath && fs.existsSync(docxPath)) {
        console.log('LibreOffice 변환 성공, DOCX 처리 중...')
        try {
          const docxText = await processDocxFileForHwp(docxPath, filePath)
          if (docxText && docxText.trim() && docxText.length > 20) {
            console.log('LibreOffice → DOCX → 텍스트 추출 성공, 길이:', docxText.length)
            console.log('추출된 텍스트 샘플:', docxText.substring(0, 200))

            // 임시 DOCX 파일 정리
            try {
              fs.unlinkSync(docxPath)
              console.log('임시 DOCX 파일 정리 완료')
            } catch (cleanupError) {
              console.log('임시 파일 정리 실패:', cleanupError)
            }

            return docxText.trim()
          }
        } catch (docxError: any) {
          console.log('DOCX 처리 실패:', docxError.message)
        }
      } else {
        console.log('LibreOffice 변환 실패')
      }
    } else {
      console.log('LibreOffice가 설치되지 않음')
    }

    // 2. 개선된 hwp.js 파싱 시도 (백업)
    console.log('개선된 hwp.js 파싱 시도...')
    try {
      const fileBuffer = fs.readFileSync(filePath)
      const hwp = require('hwp.js')
      const hwpResult = await hwp.parse(fileBuffer.toString('base64'))

      // hwpResult가 객체인 경우 본문 텍스트만 추출
      let hwpText = ''
      if (typeof hwpResult === 'object' && hwpResult !== null) {
        hwpText = extractTextFromHwpJson(hwpResult)
        console.log('hwp.js 본문 텍스트 추출, 길이:', hwpText.length)

        // 후처리 함수로 깨진 텍스트 정리
        hwpText = cleanHwpText(hwpText)

        // 추출된 텍스트가 의미있는지 확인
        if (hwpText && hwpText.trim() && hwpText.length > 20) {
          // 한글이 포함되어 있는지 확인
          const koreanChars = hwpText.match(/[가-힣]/g)
          if (koreanChars && koreanChars.length > 5) {
            console.log('개선된 hwp.js 파싱 성공, 길이:', hwpText.length)
            console.log('추출된 텍스트 샘플:', hwpText.substring(0, 200))
            return hwpText.trim()
          } else {
            console.log('hwp.js 파싱 결과에 한글이 부족함')
          }
        } else {
          console.log('hwp.js 파싱 결과가 너무 짧거나 비어있음')
        }
      } else {
        // 문자열로 반환된 경우
        hwpText = String(hwpResult || '')
        // 후처리 함수로 깨진 텍스트 정리
        hwpText = cleanHwpText(hwpText)

        if (hwpText && hwpText.trim() && hwpText.length > 20) {
          const koreanChars = hwpText.match(/[가-힣]/g)
          if (koreanChars && koreanChars.length > 5) {
            console.log('hwp.js 문자열 파싱 성공, 길이:', hwpText.length)
            return hwpText.trim()
          }
        }
      }
    } catch (hwpError: any) {
      console.log('개선된 hwp.js 파싱 실패:', hwpError.message)
    }

    // 3. 한글 인코딩 개선된 바이너리 파싱 시도
    console.log('한글 인코딩 개선된 바이너리 파싱 시도...')
    try {
      const fileBuffer = fs.readFileSync(filePath)
      const text = await extractHwpTextWithImprovedEncoding(fileBuffer)
      if (text && text.trim() && text.length > 50) {
        console.log('한글 인코딩 개선 파싱 성공, 길이:', text.length)
        console.log('한글 인코딩 개선 파싱 결과 샘플:', text.substring(0, 100))
        return text
      } else {
        console.log('한글 인코딩 개선 파싱 결과가 너무 짧거나 비어있음')
      }
    } catch (encodingError: any) {
      console.log('한글 인코딩 개선 파싱 실패:', encodingError.message)
    }

    // 4. 더 강력한 바이너리 파싱 시도
    console.log('더 강력한 바이너리 파싱 시도...')
    try {
      const fileBuffer = fs.readFileSync(filePath)
      const { extractTextFromHwpBinary } = require('./extractHwpText')
      const binaryText = extractTextFromHwpBinary(fileBuffer)
      if (binaryText && binaryText.trim() && binaryText.length > 50) {
        console.log('강력한 바이너리 파싱 성공, 길이:', binaryText.length)
        console.log('강력한 바이너리 파싱 결과 샘플:', binaryText.substring(0, 100))
        return binaryText
      } else {
        console.log('강력한 바이너리 파싱 결과가 너무 짧거나 비어있음')
      }
    } catch (binaryError: any) {
      console.log('강력한 바이너리 파싱 실패:', binaryError.message)
    }

    // 모든 방법 실패 시 안내 메시지 반환
    console.log('모든 HWP 처리 방법 실패, 안내 메시지 반환')
    return getHwpErrorMessage(originalName)
  } catch (conversionError: any) {
    console.log('변환 중 오류:', conversionError.message)
    // 변환 실패 시 HWP 파일 처리 불가 메시지 반환
    return getHwpErrorMessage(originalName)
  }
}

// 한글 인코딩 개선된 HWP 텍스트 추출 함수
async function extractHwpTextWithImprovedEncoding(fileBuffer: Buffer): Promise<string> {
  try {
    // 지원되는 인코딩만 사용
    const encodings = ['utf8', 'ascii', 'latin1']

    for (const encoding of encodings) {
      try {
        const text = fileBuffer.toString(encoding as BufferEncoding)

        // 한글 문자가 포함되어 있는지 확인
        const koreanChars = text.match(/[가-힣]/g)
        if (koreanChars && koreanChars.length > 10) {
          console.log(`${encoding} 인코딩으로 한글 텍스트 추출 성공: ${koreanChars.length} 개`)

          // 더 강력한 텍스트 정리 (바이너리 데이터 제거, 한글 문장만 추출)
          const cleanedText = text
            // 바이너리 패턴 제거 (더 강력하게)
            .replace(/[A-Za-z0-9]{15,}/g, ' ') // 15자 이상의 연속된 영숫자 제거
            .replace(/[0-9A-Fa-f]{6,}/g, ' ') // 6자 이상의 16진수 패턴 제거
            .replace(/[A-Za-z]{2,}\s+[A-Za-z]{2,}/g, ' ') // 연속된 영문 단어 제거
            .replace(/[A-Za-z0-9]{3,}[^가-힣\s]{3,}/g, ' ') // 한글이 아닌 연속된 문자 제거
            // 한글, 영문, 숫자, 공백, 기본 문장부호만 유지
            .replace(/[^\w\s가-힣.,!?;:()[\]{}"'\-]/g, ' ')
            .replace(/\s+/g, ' ') // 연속된 공백을 하나로
            .trim()

          // 한글 문장이 포함된 부분만 추출 (더 엄격하게)
          const sentences = cleanedText
            .split(/[.!?]/)
            .filter((sentence) => {
              const koreanInSentence = sentence.match(/[가-힣]/g)
              return koreanInSentence && koreanInSentence.length >= 5 // 최소 5개 한글 문자
            })
            .map((sentence) => sentence.trim())
            .filter((sentence) => sentence.length > 10) // 최소 10자

          if (sentences.length > 0) {
            const result = sentences.join('. ').trim()
            if (result.length > 50) {
              console.log('한글 문장 추출 성공:', sentences.length, '개 문장')
              return result
            }
          }
        }
      } catch (e) {
        console.log(`${encoding} 인코딩 실패:`, e)
      }
    }

    throw new Error('모든 인코딩 시도 실패')
  } catch (error: any) {
    console.log('한글 인코딩 개선 파싱 실패:', error.message)
    throw error
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

// 한컴 OAuth2 토큰 발급 함수
async function getHancomAccessToken() {
  const res = await axios.post('https://api.hancomdocs.com/v1.0/oauth2/token', {
    grant_type: 'client_credentials',
    client_id: '2J7a2v2bSP9iCJ6rf0lS',
    client_secret: '9acOeuSFaD'
  })
  return res.data.access_token
}

// 한컴 HWP → PDF 변환 함수 (에러 처리 개선)
async function hancomHwpToPdf(filePath: string, accessToken: string): Promise<Buffer> {
  const fs = require('fs')
  const fileBuffer = fs.readFileSync(filePath)
  try {
    const res = await axios.post('https://api.hancomdocs.com/v1.0/convert/pdf', fileBuffer, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        Accept: 'application/pdf'
      },
      params: { fileName: filePath.split('/').pop() },
      responseType: 'arraybuffer'
    })
    return Buffer.from(res.data)
  } catch (error: any) {
    console.error('한컴 API 변환 실패:', error.response?.status, error.response?.data)
    throw new Error(`한컴 API 변환 실패: ${error.response?.status || error.message}`)
  }
}

// Microsoft Graph API 설정
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID

// Microsoft Graph API를 통한 HWP → PDF 변환
async function msWordOnlineHwpToPdf(fileBuffer: Buffer, filename: string): Promise<Buffer> {
  try {
    console.log('[HWP→PDF] Microsoft Graph API 변환 시작:', filename)

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID) {
      throw new Error('Microsoft Graph API 설정이 필요합니다. 환경변수를 확인해주세요.')
    }

    // 1. Microsoft Graph API 액세스 토큰 획득
    const tokenResponse = await axios.post(`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    })

    const accessToken = tokenResponse.data.access_token

    // 2. OneDrive에 파일 업로드
    const uploadResponse = await axios.put(`https://graph.microsoft.com/v1.0/me/drive/root:/temp_${filename}:/content`, fileBuffer, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream'
      }
    })

    const fileId = uploadResponse.data.id

    // 3. Word Online에서 PDF로 변환
    const convertResponse = await axios.post(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/convert`,
      {
        format: 'pdf'
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    // 4. 변환된 PDF 다운로드
    const pdfResponse = await axios.get(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      responseType: 'arraybuffer'
    })

    // 5. 임시 파일 삭제
    await axios.delete(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    return Buffer.from(pdfResponse.data)
  } catch (error: any) {
    console.error('Microsoft Graph API 변환 실패:', error.message)
    throw error
  }
}

// 개선된 변환 함수 (우선순위: 로컬 MS Word → Microsoft Graph API → LibreOffice)
async function convertHwpToTextViaAppropriateMethod(fileBuffer: Buffer, filename: string): Promise<string> {
  if (isMacOS()) {
    console.log('Mac OS 감지됨, MS Word 사용')

    try {
      // 1차: 로컬 MS Word 시도
      return await convertHwpToTextViaMsWordMac(fileBuffer, filename)
    } catch (localError: any) {
      console.log('로컬 MS Word 실패, Microsoft Graph API 시도:', localError.message)

      try {
        // 2차: Microsoft Graph API 시도
        const pdfBuffer = await msWordOnlineHwpToPdf(fileBuffer, filename)
        const pdfText = await pdfParse(pdfBuffer)
        return pdfText.text.trim()
      } catch (onlineError: any) {
        console.log('Microsoft Graph API 실패, LibreOffice fallback:', onlineError.message)

        // 3차: LibreOffice fallback
        return await convertHwpToTextViaLibreOffice(fileBuffer, filename)
      }
    }
  } else {
    console.log('다른 OS 감지됨, LibreOffice 사용')
    return await convertHwpToTextViaLibreOffice(fileBuffer, filename)
  }
}

// LibreOffice를 통한 HWP → PDF 변환 (즉시 사용 가능)
async function libreOfficeHwpToPdf(filePath: string): Promise<Buffer> {
  const fs = require('fs')
  const { exec } = require('child_process')

  try {
    const pdfPath = filePath.replace(/\.hwp$/, '.pdf')
    const cmd = `soffice --headless --convert-to pdf:writer_pdf_Export --outdir "uploads" "${filePath}"`

    console.log('[HWP→PDF] LibreOffice 변환 시작:', cmd)

    await new Promise((resolve, reject) => {
      exec(cmd, (error: any, stdout: any, stderr: any) => {
        console.log('[HWP→PDF] LibreOffice stdout:', stdout)
        console.log('[HWP→PDF] LibreOffice stderr:', stderr)

        if (error) {
          console.error('[HWP→PDF] LibreOffice 변환 에러:', error)
          return reject(error)
        }

        if (!fs.existsSync(pdfPath)) {
          console.error('[HWP→PDF] PDF 파일이 생성되지 않았습니다:', pdfPath)
          return reject(new Error('PDF 파일이 생성되지 않았습니다.'))
        }

        resolve(true)
      })
    })

    const pdfBuffer = fs.readFileSync(pdfPath)
    fs.unlinkSync(pdfPath) // 임시 PDF 파일 삭제

    return pdfBuffer
  } catch (error: any) {
    console.error('LibreOffice 변환 실패:', error.message)
    throw error
  }
}

// LibreOffice를 통한 HWP → PDF → 텍스트 추출 파이프라인
async function convertHwpToTextViaLibreOffice(fileBuffer: Buffer, filename: string): Promise<string> {
  try {
    console.log('LibreOffice를 통한 HWP → PDF → 텍스트 변환 시작...')

    // 1. 임시 HWP 파일 생성
    const fs = require('fs')
    const tempFilePath = `uploads/temp_${Date.now()}.hwp`
    fs.writeFileSync(tempFilePath, fileBuffer)

    // 2. LibreOffice로 HWP → PDF 변환
    const pdfBuffer = await libreOfficeHwpToPdf(tempFilePath)
    console.log('LibreOffice HWP → PDF 변환 완료, PDF 크기:', pdfBuffer.length)

    // 3. PDF → 텍스트 추출
    const pdfText = await pdfParse(pdfBuffer)
    const extractedText = pdfText.text.trim()

    // 4. 임시 파일 정리
    fs.unlinkSync(tempFilePath)

    console.log('PDF → 텍스트 추출 완료, 텍스트 길이:', extractedText.length)
    return extractedText
  } catch (error: any) {
    console.error('LibreOffice 변환 실패:', error.message)

    // 임시 파일 정리
    const fs = require('fs')
    const tempFilePath = `uploads/temp_${Date.now()}.hwp`
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath)

    throw new Error(`LibreOffice 변환 실패: ${error.message}`)
  }
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

    // 2. 한컴 API로 HWP → PDF 변환
    const pdfBuffer = await hancomHwpToPdf(saveName, accessToken)
    // 3. 결과 반환 (PDF 파일을 base64로 반환)
    res.json({ pdfBase64: pdfBuffer.toString('base64') })
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
          // 2. hwp.js 실패 시 Microsoft Graph API로 PDF 변환 시도
          console.log('Microsoft Graph API 변환 시도...')
          const pdfBuffer = await msWordOnlineHwpToPdf(fileBuffer, fileName)
          const pdfText = await pdfParse(pdfBuffer)
          text = pdfText.text.trim()

          if (!text || text.trim().length === 0) {
            console.warn('Microsoft Graph API에서 추출된 텍스트가 비어있습니다.')
            text = '텍스트를 추출할 수 없습니다. (빈 문서이거나 변환 실패)'
          }

          // 임시 파일 정리
          fs.unlinkSync(filePath)
        } catch (onlineError: any) {
          console.error('Microsoft Graph API 변환도 실패:', onlineError.message)

          // 임시 파일 정리
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

          // 5. 최종 대안: 파일을 그대로 텍스트로 읽어보기
          try {
            const rawText = fs.readFileSync(filePath, 'utf8')
            if (rawText && rawText.trim().length > 0) {
              text = rawText
              console.log('파일을 직접 읽어서 텍스트 추출 성공')
            }
          } catch (readError) {
            console.error('파일 직접 읽기 실패:', readError)
          }

          return res.status(400).json({
            error: 'HWP 파일 변환에 실패했습니다.',
            detail: `hwp.js: ${(hwpError as any).message}, Microsoft Graph API: ${onlineError.message}`,
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
            // 방법 2: Microsoft Graph API 사용
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

// 한컴 API를 활용한 HWP → PDF → 텍스트 추출 API (새로운 방식)
app.post('/extract-hwp-via-hancom-pdf', upload.single('data'), async (req: any, res: any) => {
  console.log('==== /extract-hwp-via-hancom-pdf 호출됨 ====')

  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    }

    const fileBuffer = fs.readFileSync(req.file.path)
    const filename = req.file.originalname

    console.log(`HWP 파일 처리 시작: ${filename}, 크기: ${fileBuffer.length} bytes`)

    // 한컴 API를 통한 HWP → PDF → 텍스트 추출
    const extractedText = await convertHwpToTextViaAppropriateMethod(fileBuffer, filename)

    // 임시 파일 정리
    fs.unlinkSync(req.file.path)

    res.json({
      success: true,
      filename: filename,
      text: extractedText,
      method: isMacOS() ? 'MS Word (Mac)' : 'LibreOffice',
      textLength: extractedText.length
    })
  } catch (error: any) {
    console.error('LibreOffice를 통한 HWP 변환 실패:', error)

    // 임시 파일 정리
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }

    res.status(500).json({
      error: 'LibreOffice를 통한 HWP 변환 실패',
      detail: error.message,
      suggestion: '다른 변환 방법을 시도해보세요: /extract-hwp-text-enhanced'
    })
  }
})

// Microsoft Graph API만 사용하는 HWP → PDF 변환 전용 엔드포인트
app.post('/convert-hwp-to-pdf', upload.single('data'), async (req: any, res: any) => {
  console.log('==== /convert-hwp-to-pdf 호출됨 ====')
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    }
    const fileBuffer = fs.readFileSync(req.file.path)
    const filename = req.file.originalname
    console.log(`HWP → PDF 변환 시작: ${filename}`)

    // Microsoft Graph API를 통한 HWP → PDF 변환
    const pdfBuffer = await msWordOnlineHwpToPdf(fileBuffer, filename)
    console.log('Microsoft Graph API HWP → PDF 변환 완료, PDF 크기:', pdfBuffer.length)

    // PDF 파일로 저장
    const pdfFilename = filename.replace(/\.hwp$/i, '.pdf')
    const pdfPath = path.join('uploads', `ms_${Date.now()}_${pdfFilename}`)
    fs.writeFileSync(pdfPath, pdfBuffer)
    console.log(`PDF 변환 완료: ${pdfPath}`)

    // PDF 파일 다운로드
    res.download(pdfPath, pdfFilename, (err: any) => {
      // 임시 파일 정리
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath)
      if (err) {
        console.error('PDF 다운로드 중 오류:', err)
      }
    })
  } catch (error: any) {
    console.error('Microsoft Graph API를 통한 PDF 변환 실패:', error)
    // 임시 파일 정리
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({
      error: 'Microsoft Graph API를 통한 PDF 변환 실패',
      detail: error.message
    })
  }
})

// 새로운 엔드포인트: HWP는 PDF로 변환, 나머지는 원본 반환
app.post('/convert-and-serve', upload.single('data'), async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
  }
  const ext = path.extname(req.file.originalname).toLowerCase()
  const filePath = req.file.path
  const uploadsDir = 'uploads'

  if (ext === '.hwp') {
    // HWP → PDF 변환 (Microsoft Graph API 활용)
    try {
      // Microsoft Graph API를 통한 HWP → PDF 변환
      const pdfBuffer = await msWordOnlineHwpToPdf(req.file.buffer, req.file.originalname)
      const pdfText = await pdfParse(pdfBuffer)
      const extractedText = pdfText.text.trim()

      // PDF 파일로 저장
      const pdfPath = filePath.replace(/\.hwp$/, '.pdf')
      fs.writeFileSync(pdfPath, pdfBuffer)

      // 원본 HWP 파일 삭제
      fs.unlinkSync(filePath)
      // PDF 파일을 바로 전송
      res.download(pdfPath, path.basename(pdfPath), (err: any) => {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath)
        if (err) {
          console.error('[HWP→PDF] PDF 다운로드 중 오류:', err)
        }
      })
    } catch (err) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      // 에러 메시지에 변환 명령어, 파일명, 에러 내용을 포함
      console.error('[HWP→PDF] 최종 변환 실패:', (err as any).message)
      return res.status(500).json({ error: 'HWP → PDF 변환 실패', detail: (err as any).message, file: req.file.originalname })
    }
  } else {
    // 나머지 파일은 원본 그대로 전송
    res.download(filePath, req.file.originalname, (err: any) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      if (err) {
        console.error('파일 다운로드 중 오류:', err)
      }
    })
  }
})

// 정적 파일 서빙 (업로드된 파일 다운로드 지원)
app.use('/uploads', express.static('uploads'))

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
  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`)
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`🔗 Health check: http://localhost:${PORT}/health`)
    console.log(`📄 HWP Extract: http://localhost:${PORT}/extract-hwp-text`)
  })

  // 서버 타임아웃 설정
  server.timeout = 300000 // 5분
  server.keepAliveTimeout = 65000 // 65초
  server.headersTimeout = 66000 // 66초

  // 서버 에러 핸들링
  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use`)
      console.error('💡 Please try:')
      console.error(`   lsof -i :${PORT}`)
      console.error(`   kill -9 <PID>`)
      process.exit(1)
    } else {
      console.error('❌ Server error:', error)
      process.exit(1)
    }
  })

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully')
    server.close(() => {
      console.log('✅ Server closed')
      process.exit(0)
    })
  })

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully')
    server.close(() => {
      console.log('✅ Server closed')
      process.exit(0)
    })
  })
}

// HWP 파일 처리 시 명확한 안내 메시지 반환
function getHwpErrorMessage(filename: string): string {
  return `HWP 파일 "${filename}"은 현재 자동 텍스트 추출이 불가능합니다.

📋 **HWP 파일 처리 한계:**
• HWP 파일은 EUC-KR/CP949 인코딩을 사용하여 Node.js에서 자동 변환이 어려움
• hwp.js, node-hwp, 바이너리 파싱 등 모든 방법이 인코딩 문제로 실패
• MS Word Online은 클라우드 환경에서 설치/실행 불가

💡 **권장 해결책:**
1. HWP 파일을 DOCX로 변환 후 업로드
2. HWP 파일을 PDF로 변환 후 업로드 (OCR 필요할 수 있음)
3. HWP 파일 내용을 텍스트로 복사하여 TXT 파일로 저장 후 업로드

현재 지원되는 파일 형식: DOCX, PDF, XLSX, TXT, CSV, HWPX`
}

// LibreOffice를 사용한 HWP → DOCX 자동 변환 함수 (강화된 버전)
async function convertHwpToDocxWithLibreOffice(hwpPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(hwpPath)
    const outputPath = path.join(outputDir, path.basename(hwpPath, '.hwp') + '.docx')

    // 여러 가능한 LibreOffice 명령어 시도
    const commands = [
      `soffice --headless --convert-to docx --outdir "${outputDir}" "${hwpPath}"`,
      `libreoffice --headless --convert-to docx --outdir "${outputDir}" "${hwpPath}"`,
      `/usr/bin/soffice --headless --convert-to docx --outdir "${outputDir}" "${hwpPath}"`,
      `/usr/bin/libreoffice --headless --convert-to docx --outdir "${outputDir}" "${hwpPath}"`,
      `/usr/local/bin/soffice --headless --convert-to docx --outdir "${outputDir}" "${hwpPath}"`,
      `/usr/local/bin/libreoffice --headless --convert-to docx --outdir "${outputDir}" "${hwpPath}"`
    ]

    let commandIndex = 0

    function tryNextCommand() {
      if (commandIndex >= commands.length) {
        console.log('모든 LibreOffice 명령어 시도 실패')
        resolve(null)
        return
      }

      const command = commands[commandIndex]
      console.log(`LibreOffice 변환 시도 ${commandIndex + 1}: ${command}`)

      exec(
        command,
        {
          timeout: 60000, // 60초 타임아웃
          env: {
            ...process.env,
            HOME: '/tmp',
            DISPLAY: ':99'
          }
        },
        (error, stdout, stderr) => {
          console.log(`LibreOffice 변환 결과 ${commandIndex + 1}:`)
          console.log('stdout:', stdout)
          console.log('stderr:', stderr)

          if (error) {
            console.log(`LibreOffice 변환 실패 ${commandIndex + 1}:`, error)
            commandIndex++
            tryNextCommand()
            return
          }

          // 변환된 파일이 실제로 생성되었는지 확인
          if (fs.existsSync(outputPath)) {
            console.log('LibreOffice 변환 성공! 생성된 DOCX 파일:', outputPath)
            resolve(outputPath)
          } else {
            console.log('변환된 파일을 찾을 수 없음:', outputPath)
            commandIndex++
            tryNextCommand()
          }
        }
      )
    }

    tryNextCommand()
  })
}

// Mac 환경에서 MS Word를 통한 HWP → PDF 변환
async function msWordHwpToPdfMac(filePath: string): Promise<Buffer> {
  const fs = require('fs')
  const { exec } = require('child_process')

  try {
    console.log('[HWP→PDF] MS Word 변환 시작 (Mac):', filePath)

    // AppleScript를 통한 MS Word 제어
    const appleScript = `
      tell application "Microsoft Word"
        activate
        set docFile to POSIX file "${filePath}"
        open docFile
        set activeDoc to active document
        set pdfPath to POSIX file "${filePath.replace(/\.hwp$/, '.pdf')}"
        save as activeDoc in pdfPath as PDF
        close activeDoc saving no
        quit
      end tell
    `

    // AppleScript 실행
    await new Promise((resolve, reject) => {
      exec(`osascript -e '${appleScript}'`, (error: any, stdout: any, stderr: any) => {
        console.log('[HWP→PDF] AppleScript stdout:', stdout)
        console.log('[HWP→PDF] AppleScript stderr:', stderr)

        if (error) {
          console.error('[HWP→PDF] AppleScript 실행 에러:', error)
          return reject(error)
        }

        const pdfPath = filePath.replace(/\.hwp$/, '.pdf')
        if (!fs.existsSync(pdfPath)) {
          console.error('[HWP→PDF] PDF 파일이 생성되지 않았습니다:', pdfPath)
          return reject(new Error('PDF 파일이 생성되지 않았습니다.'))
        }

        resolve(true)
      })
    })

    const pdfBuffer = fs.readFileSync(filePath.replace(/\.hwp$/, '.pdf'))
    fs.unlinkSync(filePath.replace(/\.hwp$/, '.pdf')) // 임시 PDF 파일 삭제

    return pdfBuffer
  } catch (error: any) {
    console.error('MS Word 변환 실패 (Mac):', error.message)
    throw error
  }
}

// Mac 환경에서 MS Word를 통한 HWP → PDF → 텍스트 추출 파이프라인
async function convertHwpToTextViaMsWordMac(fileBuffer: Buffer, filename: string): Promise<string> {
  try {
    console.log('MS Word를 통한 HWP → PDF → 텍스트 변환 시작 (Mac)...')

    // 1. 임시 HWP 파일 생성
    const fs = require('fs')
    const tempFilePath = `uploads/temp_${Date.now()}.hwp`
    fs.writeFileSync(tempFilePath, fileBuffer)

    // 2. MS Word로 HWP → PDF 변환
    const pdfBuffer = await msWordHwpToPdfMac(tempFilePath)
    console.log('MS Word HWP → PDF 변환 완료, PDF 크기:', pdfBuffer.length)

    // 3. PDF → 텍스트 추출
    const pdfText = await pdfParse(pdfBuffer)
    const extractedText = pdfText.text.trim()

    // 4. 임시 파일 정리
    fs.unlinkSync(tempFilePath)

    console.log('PDF → 텍스트 추출 완료, 텍스트 길이:', extractedText.length)
    return extractedText
  } catch (msError: any) {
    console.error('MS Word 변환 실패 (Mac), Microsoft Graph API fallback 시도:', msError.message)

    // MS Word 실패 시 Microsoft Graph API로 fallback
    const fs = require('fs')
    const tempFilePath = `uploads/temp_${Date.now()}.hwp`
    fs.writeFileSync(tempFilePath, fileBuffer)

    try {
      const { exec } = require('child_process')
      const pdfPath = tempFilePath.replace(/\.hwp$/, '.pdf')
      const cmd = `soffice --headless --convert-to pdf:writer_pdf_Export --outdir "uploads" "${tempFilePath}"`

      await new Promise((resolve, reject) => {
        exec(cmd, (error: any, stdout: any, stderr: any) => {
          if (error) {
            console.error('Microsoft Graph API 변환 실패:', error)
            return reject(error)
          }
          if (!fs.existsSync(pdfPath)) {
            return reject(new Error('PDF 파일이 생성되지 않았습니다.'))
          }
          resolve(true)
        })
      })

      const pdfBuffer = fs.readFileSync(pdfPath)
      const pdfText = await pdfParse(pdfBuffer)
      const extractedText = pdfText.text.trim()

      // 임시 파일 정리
      fs.unlinkSync(tempFilePath)
      fs.unlinkSync(pdfPath)

      console.log('Microsoft Graph API fallback 성공, 텍스트 길이:', extractedText.length)
      return extractedText
    } catch (onlineError: any) {
      console.error('Microsoft Graph API fallback도 실패:', onlineError.message)

      // 임시 파일 정리
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath)
      const pdfPath = tempFilePath.replace(/\.hwp$/, '.pdf')
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath)

      throw new Error(`모든 변환 방법 실패: MS Word Mac(${msError.message}), Microsoft Graph API(${onlineError.message})`)
    }
  }
}

// OS 감지 함수
function isMacOS(): boolean {
  return process.platform === 'darwin'
}

// Mac 환경에서 MS Word를 이용한 HWP → PDF 프린트 자동화 엔드포인트
app.post('/print-hwp-to-pdf', upload.single('data'), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    }
    const ext = path.extname(req.file.originalname).toLowerCase()
    if (ext !== '.hwp') {
      return res.status(400).json({ error: 'HWP 파일만 변환할 수 있습니다.' })
    }
    const filePath = req.file.path
    // Mac 환경에서만 동작
    if (!isMacOS()) {
      return res.status(400).json({ error: '이 엔드포인트는 Mac 환경에서만 동작합니다.' })
    }
    // MS Word로 HWP → PDF 변환
    const pdfBuffer = await msWordHwpToPdfMac(filePath)
    const pdfFilename = req.file.originalname.replace(/\.hwp$/i, '.pdf')
    const pdfPath = filePath.replace(/\.hwp$/, '.pdf')
    fs.writeFileSync(pdfPath, pdfBuffer)
    // PDF 파일 다운로드
    res.download(pdfPath, pdfFilename, (err: any) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath)
      if (err) {
        console.error('PDF 다운로드 중 오류:', err)
      }
    })
  } catch (error: any) {
    console.error('MS Word 프린트(PDF) 변환 실패:', error)
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({ error: 'MS Word 프린트(PDF) 변환 실패', detail: error.message })
  }
})

// CloudConvert 기반 HWP→PDF 자동 변환 엔드포인트 ㅁㅈㅇ
app.post('/convert-hwp-to-pdf-cloudconvert', upload.single('data'), async (req: any, res: any) => {
  console.log('==== /convert-hwp-to-pdf-cloudconvert 라우트 진입 ====', new Date().toISOString())
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    }
    const ext = path.extname(req.file.originalname).toLowerCase()
    if (ext !== '.hwp') {
      return res.status(400).json({ error: 'HWP 파일만 변환할 수 있습니다.' })
    }
    const apiKey =
      process.env.CLOUDCONVERT_API_KEY ||
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiZDFkNDI5NDlhNDg1YmE4MDEzNjgzYTJiOWNiNTQ3ODI2MjA4OTA4MmI3ZDhiZDNkYTQ2MWIwOWE0OTA5MDM0ZjI0MjY4YWU5MWVhYzA5ZTQiLCJpYXQiOjE3NTE0Mjg2MjUuOTQ3NzEyLCJuYmYiOjE3NTE0Mjg2MjUuOTQ3NzEzLCJleHAiOjQ5MDcxMDIyMjUuOTQyNTY4LCJzdWIiOiI3MjM0MTQ5OCIsInNjb3BlcyI6W119.SbkQjqRWVsmq3H4xNq6CAV0_NIYjyOF6wan3GAs5ZbXgrBe5tVXsV-PpKuY0XG5Op-yq2H13vbzIebHCoWwQxZGSxQZwGskZ71BBF3riA2v4Wy2J0JkAFgWdQXW1DDx2vMngJ7hVLokXbURqHGhopBBEcPedTINPtX8CBtjcd6YZmOMrsM-RSk_e9cbG3MZEtb4aloRSxqDA06G_ST5w99yfAAcnmaiTz1q7N37EvzeYuUzIYoKUhSUETe9RaNM1-71-5wpLRIrbcMHX2zye9lPQTquDxsyEhjjnPciOyP6ZV0xWPyMgqJ8a6bGDax924orWQlaNjedLw77cCJur3h4wW8jWYOvZPQbIzTeG8YMpUYG15sYgqVRrRVimvdzyq2_aYLM2vLBzjy34rsKGvnAJapIipDevwkbgIy-Idf_I2wcVq1vGqL3BL7UW-24Av6N-wAmCp41XK0eCuEo2zskeTObyAweOdcIfOfNZNWPaemC-hTfOit4RPqAVFrtP1Zyag_BJMkbFKJlfzwDtp6Gxdc0k_jmqTt2bx2wpPF2BCKOw1PJWqU3IzViUhPI1Vec9Y9nXCqDJmUnZz2v4dPheT294OmpepdqJfSczW5c4Sg_dK633F8Wtbs9uyEmKugE9q3qkHnbJHrweS7Ep3xG8TdUW-32WBYXGJB0g9NY'
    const cloudConvert = new CloudConvert(apiKey)
    const fs = require('fs')

    // 1. Job 생성
    const job = await cloudConvert.jobs.create({
      tasks: {
        'import-my-file': {
          operation: 'import/upload'
        },
        'convert-my-file': {
          operation: 'convert',
          input: 'import-my-file',
          input_format: 'hwp',
          output_format: 'pdf'
        },
        'export-my-file': {
          operation: 'export/url',
          input: 'convert-my-file'
        }
      }
    })

    // 2. 파일 업로드
    const uploadTask = job.tasks.filter((task: any) => task.name === 'import-my-file')[0]
    await cloudConvert.tasks.upload(uploadTask, fs.createReadStream(req.file.path))

    // 3. 변환 완료 대기
    const completedJob = await cloudConvert.jobs.wait(job.id)

    // 4. 결과 다운로드
    const exportTask = completedJob.tasks.filter((task: any) => task.operation === 'export/url')[0]

    if (!exportTask.result || !exportTask.result.files || !exportTask.result.files[0]) {
      throw new Error('CloudConvert 변환 결과를 찾을 수 없습니다.')
    }

    const file = exportTask.result.files[0]
    if (!file.url) {
      throw new Error('변환된 파일의 URL을 찾을 수 없습니다.')
    }

    const response = await fetch(file.url)
    const buffer = await response.arrayBuffer()
    const pdfPath = req.file.path.replace(/\.hwp$/, '.pdf')
    fs.writeFileSync(pdfPath, Buffer.from(buffer))

    // PDF 파일 다운로드
    res.download(pdfPath, req.file.originalname.replace(/\.hwp$/i, '.pdf'), (err: any) => {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath)
      if (err) {
        console.error('PDF 다운로드 중 오류:', err)
      }
    })
  } catch (error: any) {
    console.error('CloudConvert 변환 실패:', error)
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({ error: 'CloudConvert 변환 실패', detail: error.message })
  }
})
