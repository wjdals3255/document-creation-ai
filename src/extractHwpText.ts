import fs from 'fs'
import fileType from 'file-type'
import { parse as parseHwp } from 'hwp.js'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import XLSX from 'xlsx'
import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'

export async function extractHwpText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath)
  const type = await fileType.fromBuffer(buffer)
  const ext = type?.ext || filePath.split('.').pop()?.toLowerCase() || ''
  let text = ''

  console.log('파일 경로:', filePath)
  console.log('감지된 파일 형식:', type?.ext)
  console.log('파일 확장자:', filePath.split('.').pop()?.toLowerCase())
  console.log('최종 사용 확장자:', ext)

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
    } else if (ext === 'txt' || ext === 'csv') {
      // TXT, CSV
      return buffer.toString('utf-8').trim()
    } else if (ext === 'hwpx' || filePath.endsWith('.hwpx')) {
      // HWPX (압축 해제 후 Contents.xml 파싱)
      const zip = new AdmZip(filePath)
      const contentsXmlEntry = zip.getEntry('Contents.xml')
      if (!contentsXmlEntry) throw new Error('HWPX: Contents.xml을 찾을 수 없습니다.')
      const contentsXml = contentsXmlEntry.getData().toString('utf-8')
      const xml = await parseStringPromise(contentsXml, { explicitArray: false })
      // 본문 텍스트 추출 (섹션 > 문단 > 텍스트)
      let hwpxText = ''
      try {
        const body = xml?.HWPML?.BODY
        const sections = Array.isArray(body?.SECTION) ? body.SECTION : [body?.SECTION]
        for (const section of sections) {
          const paragraphs = Array.isArray(section?.P) ? section.P : [section?.P]
          for (const p of paragraphs) {
            if (p && p['#text']) {
              hwpxText += p['#text'] + '\n'
            } else if (p && p.RUN) {
              const runs = Array.isArray(p.RUN) ? p.RUN : [p.RUN]
              for (const run of runs) {
                if (run['#text']) hwpxText += run['#text']
              }
              hwpxText += '\n'
            }
          }
        }
      } catch (e) {
        throw new Error('HWPX 본문 텍스트 추출 중 오류: ' + e)
      }
      return hwpxText.trim()
    } else {
      // 파일 형식이 감지되지 않은 경우, 파일 확장자로 재시도
      const fallbackExt = filePath.split('.').pop()?.toLowerCase()
      console.log('파일 형식 감지 실패, 확장자로 재시도:', fallbackExt)

      if (fallbackExt === 'txt' || fallbackExt === 'csv') {
        return buffer.toString('utf-8').trim()
      }

      throw new Error(`지원하지 않는 파일 형식입니다: ${ext}`)
    }
  } catch (err: any) {
    throw new Error(`파일 파싱 실패: ${err && err.message ? err.message : '지원하지 않는 파일이거나 파싱에 실패했습니다.'}`)
  }
}
