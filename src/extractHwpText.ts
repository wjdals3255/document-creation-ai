import fs from 'fs'
import fileType from 'file-type'
import { parse as parseHwp } from 'hwp.js'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import XLSX from 'xlsx'
import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'

// node-hwp 라이브러리 추가
let nodeHwp: any = null
try {
  nodeHwp = require('node-hwp')
} catch (error) {
  console.log('node-hwp 라이브러리를 불러올 수 없습니다:', error)
}

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
      // HWP(구버전, 바이너리) - 개선된 파싱
      console.log('HWP 파일 파싱 시작...')

      // 방법 0: node-hwp로 파싱 시도 (새로 추가)
      if (nodeHwp) {
        try {
          console.log('node-hwp 파싱 시도...')
          const nodeHwpResult = await nodeHwp.parse(buffer)
          if (nodeHwpResult && nodeHwpResult.text && nodeHwpResult.text.trim()) {
            console.log('node-hwp 파싱 성공, 길이:', nodeHwpResult.text.length)
            return nodeHwpResult.text.trim()
          }
        } catch (nodeHwpError: any) {
          console.log('node-hwp 파싱 실패:', nodeHwpError.message)
        }
      }

      try {
        // 방법 1: hwp.js로 파싱 시도
        const base64 = buffer.toString('base64')
        const doc = parseHwp(base64 as any)

        if (doc && doc.sections) {
          console.log('hwp.js 파싱 성공, 섹션 수:', doc.sections.length)

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

          if (text.trim()) {
            console.log('hwp.js로 텍스트 추출 성공, 길이:', text.length)
            return text.trim()
          }
        }
      } catch (hwpError: any) {
        console.log('hwp.js 파싱 실패:', hwpError.message)
      }

      // 방법 2: 바이너리 직접 파싱 시도 (간단한 텍스트 추출)
      try {
        console.log('바이너리 직접 파싱 시도...')
        const textFromBinary = extractTextFromHwpBinary(buffer)
        if (textFromBinary.trim()) {
          console.log('바이너리 파싱으로 텍스트 추출 성공, 길이:', textFromBinary.length)
          return textFromBinary.trim()
        }
      } catch (binaryError: any) {
        console.log('바이너리 파싱 실패:', binaryError.message)
      }

      // 방법 3: 파일이 비어있지 않은 경우 기본 메시지
      if (buffer.length > 0) {
        console.log('HWP 파일이 감지되었으나 텍스트 추출에 실패했습니다.')
        return 'HWP 파일이 감지되었으나 텍스트 추출에 실패했습니다. 한컴 API를 사용하거나 파일을 다시 확인해주세요.'
      }

      throw new Error('HWP 파일 파싱에 실패했습니다.')
    } else if (ext === 'pdf') {
      // PDF - 개선된 파싱
      console.log('PDF 파일 파싱 시작...')
      try {
        const data = await pdfParse(buffer)
        const extractedText = data.text.trim()

        if (extractedText) {
          console.log('PDF 텍스트 추출 성공, 길이:', extractedText.length)
          return extractedText
        } else {
          console.log('PDF에서 텍스트를 추출할 수 없습니다. 이미지 기반 PDF일 가능성이 높습니다.')
          return 'PDF에서 텍스트를 추출할 수 없습니다. 이미지 기반 PDF의 경우 OCR이 필요합니다.'
        }
      } catch (pdfError: any) {
        console.log('PDF 파싱 실패:', pdfError.message)
        throw new Error(`PDF 파싱 실패: ${pdfError.message}`)
      }
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

// HWP 바이너리에서 텍스트 추출하는 개선된 함수
function extractTextFromHwpBinary(buffer: Buffer): string {
  try {
    console.log('바이너리 파싱 개선 시도...')

    // 방법 1: UTF-8 인코딩 시도
    try {
      const utf8String = buffer.toString('utf-8')
      const koreanPattern = /[가-힣]+/g
      const utf8Matches = utf8String.match(koreanPattern)

      if (utf8Matches && utf8Matches.length > 0) {
        console.log('UTF-8 인코딩으로 한글 텍스트 추출 성공:', utf8Matches.length, '개')
        return utf8Matches.join(' ')
      }
    } catch (utf8Error) {
      console.log('UTF-8 인코딩 실패:', utf8Error)
    }

    // 방법 2: 바이너리에서 직접 한글 패턴 찾기 (더 정교한 방법)
    try {
      const koreanBytes = []
      for (let i = 0; i < buffer.length - 1; i++) {
        const byte1 = buffer[i]
        const byte2 = buffer[i + 1]

        // 한글 완성형 코드 (EUC-KR 기준)
        if (byte1 >= 0xb0 && byte1 <= 0xc8 && byte2 >= 0xa1 && byte2 <= 0xfe) {
          koreanBytes.push(byte1, byte2)
        }
      }

      if (koreanBytes.length > 0) {
        // EUC-KR 대신 UTF-8로 시도
        const koreanBuffer = Buffer.from(koreanBytes)
        const koreanText = koreanBuffer.toString('utf-8')
        console.log('바이너리 직접 파싱으로 한글 텍스트 추출 성공:', koreanText.length)
        return koreanText
      }
    } catch (binaryError) {
      console.log('바이너리 직접 파싱 실패:', binaryError)
    }

    // 방법 3: 전체 버퍼에서 한글 패턴 찾기
    try {
      const bufferString = buffer.toString('utf-8', 0, Math.min(buffer.length, 50000))
      const koreanPattern = /[가-힣]+/g
      const matches = bufferString.match(koreanPattern)

      if (matches && matches.length > 0) {
        console.log('전체 버퍼에서 한글 텍스트 추출 성공:', matches.length, '개')
        return matches.join(' ')
      }
    } catch (bufferError) {
      console.log('전체 버퍼 파싱 실패:', bufferError)
    }

    console.log('모든 인코딩 방법 실패')
    return ''
  } catch (error) {
    console.log('바이너리 텍스트 추출 중 오류:', error)
    return ''
  }
}
