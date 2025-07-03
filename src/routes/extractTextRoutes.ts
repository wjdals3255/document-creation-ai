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
      text = data.text
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
  const outputDir = 'uploads/pdf-images-' + Date.now()
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
    // -1: 모든 페이지 변환
    const result = await convert.bulk(-1)
    // 변환된 이미지 파일 경로 리스트 생성
    const imagePaths = result.map((r: any) => r.path)
    res.json({
      success: true,
      filename: originalName,
      imageCount: imagePaths.length,
      images: imagePaths
    })
  } catch (e) {
    res.status(500).json({ error: 'PDF → 이미지 변환 실패', detail: e instanceof Error ? e.message : e })
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
})

export default router
