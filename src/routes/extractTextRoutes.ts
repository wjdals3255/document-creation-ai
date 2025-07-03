import express, { Request, Response } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import XLSX from 'xlsx'

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
    } else {
      res.status(400).json({ error: '지원하지 않는 파일 형식입니다.' })
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

export default router
