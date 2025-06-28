import express from 'express'
import multer from 'multer'
import path from 'path'
import { extractHwpxText } from '../utils/hwpx/extractHwpxText'

const router = express.Router()

// uploads 디렉토리에 파일 저장
const upload = multer({ dest: path.join(__dirname, '../../uploads/') })

// POST /extract-hwpx-text
router.post('/extract-hwpx-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '파일이 업로드되지 않았습니다.' })
      return
    }
    const text = await extractHwpxText(req.file.path)
    res.json({ text })
    return
  } catch (error: any) {
    res.status(500).json({ error: error.message || '텍스트 추출 중 오류 발생' })
    return
  }
})

export default router
