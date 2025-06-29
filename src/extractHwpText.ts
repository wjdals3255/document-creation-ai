import fs from 'fs'
import fileType from 'file-type'
import { parse as parseHwp } from 'hwp.js'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import XLSX from 'xlsx'

export async function extractHwpText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath)
  const type = await fileType.fromBuffer(buffer)
  const ext = type?.ext || filePath.split('.').pop()?.toLowerCase() || ''
  let text = ''

  try {
    if (ext === 'hwp' || ext === 'cfb') {
      // HWP(구버전, 바이너리)
      const base64 = buffer.toString('base64')
      const doc = parseHwp(base64 as any)
      if (doc && doc.sections) {
        for (const section of doc.sections) {
          for (const key in section) {
            const value = (section as any)[key]
            if (typeof value === 'object' && value !== null) {
              if (Array.isArray(value)) {
                for (const item of value) {
                  if (item && typeof item.text === 'string') {
                    text += item.text + '\n'
                  }
                }
              }
            }
          }
        }
      }
      return text.trim()
    } else if (ext === 'pdf') {
      // PDF
      const data = await pdfParse(buffer)
      return data.text.trim()
    } else if (ext === 'docx') {
      // DOCX
      const result = await mammoth.extractRawText({ buffer })
      return result.value.trim()
    } else if (ext === 'xlsx') {
      // XLSX
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      let result = ''
      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName]
        const csv = XLSX.utils.sheet_to_csv(sheet)
        result += csv + '\n'
      })
      return result.trim()
    } else {
      throw new Error(`지원하지 않는 파일 형식입니다: ${ext}`)
    }
  } catch (err: any) {
    throw new Error(`파일 파싱 실패: ${err.message}`)
  }
}
