import express, { Request, Response } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import XLSX from 'xlsx'
import { fromPath } from 'pdf2pic'

const router = express.Router()
const upload = multer({ dest: 'uploads/' })

// POST /extract-text
router.post('/extract-text', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    return
  }
  const filePath = req.file.path
  const originalName = req.file.originalname
  const ext = path.extname(originalName).toLowerCase()
  try {
    let text = ''
    if (ext === '.pdf') {
      const buffer = fs.readFileSync(filePath)
      const data = await pdfParse(buffer)
      if (data.text && data.text.trim().length > 10) {
        // 텍스트 PDF
        text = data.text
        res.json({
          success: true,
          filename: originalName,
          text,
          textLength: text.length,
          ext
        })
      } else {
        // 이미지 PDF (스캔본)
        res.json({
          success: false,
          filename: originalName,
          message: '이미지형태 문서입니다. 텍스트 추출 불가',
          ext
        })
      }
      return
    } else if (ext === '.xlsx') {
      const buffer = fs.readFileSync(filePath)
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      workbook.SheetNames.forEach((sheetName) => {
        const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })
        text += (sheet as string[][]).map((row: string[]) => row.join('\t')).join('\n') + '\n'
      })
    } else if (ext === '.txt') {
      text = fs.readFileSync(filePath, 'utf-8')
    } else {
      res.status(400).json({ error: '지원하지 않는 파일 형식입니다. (pdf, xlsx, txt만 지원)' })
      return
    }
    res.json({
      success: true,
      filename: originalName,
      text,
      textLength: text.length,
      ext
    })
  } catch (e) {
    res.status(500).json({ error: '텍스트 추출 실패', detail: e instanceof Error ? e.message : e })
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
})

// PDF → 이미지 변환 API
router.post('/pdf-to-images', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
    return
  }
  const filePath = req.file.path
  const originalName = req.file.originalname
  const ext = path.extname(originalName)
  const safeBase = Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const outputDir = 'uploads/pdf-images-' + safeBase
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  try {
    const options = {
      density: 200,
      saveFilename: 'page',
      savePath: outputDir,
      format: 'png',
      width: 1200,
      height: 1600
    }
    const convert = fromPath(filePath, options)
    const result = await convert.bulk(-1)
    console.log('pdf2pic 변환 결과:', result)
    console.log('outputDir:', outputDir)

    // 실제 파일 시스템에서 생성된 파일 목록 확인
    let actualFiles: string[] = []
    if (fs.existsSync(outputDir)) {
      actualFiles = fs.readdirSync(outputDir)
      console.log('실제 생성된 파일 목록:', actualFiles)
    } else {
      console.log('outputDir이 생성되지 않음')
    }

    // 실제 파일 시스템의 파일들을 기반으로 이미지 경로 생성
    const imagePaths = actualFiles
      .filter((file) => file.toLowerCase().endsWith('.png'))
      .sort((a, b) => {
        // page.1.png, page.2.png 순으로 정렬
        const aNum = parseInt(a.match(/page\.(\d+)\.png/)?.[1] || '0')
        const bNum = parseInt(b.match(/page\.(\d+)\.png/)?.[1] || '0')
        return aNum - bNum
      })
      .map((file) => `/uploads/pdf-images-${safeBase}/${file}`)

    console.log('반환할 이미지 경로들:', imagePaths)

    res.json({
      success: true,
      filename: originalName,
      safeDir: outputDir,
      imageCount: imagePaths.length,
      images: imagePaths,
      actualFiles: actualFiles // 디버깅용
    })
  } catch (e) {
    console.error('PDF → 이미지 변환 실패:', e)
    res.status(500).json({ error: 'PDF → 이미지 변환 실패', detail: e instanceof Error ? e.message : e })
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
})

export default router
