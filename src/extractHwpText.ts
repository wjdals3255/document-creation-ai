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

// HWP 파일 처리 시 명확한 안내 메시지 반환
function getHwpErrorMessage(filename: string): string {
  return `HWP 파일 "${filename}"은 현재 자동 텍스트 추출이 불가능합니다.

📋 **HWP 파일 처리 한계:**
• HWP 파일은 EUC-KR/CP949 인코딩을 사용하여 Node.js에서 자동 변환이 어려움
• hwp.js, node-hwp, 바이너리 파싱 등 모든 방법이 인코딩 문제로 실패
• 한컴 API는 서비스 중단 상태 (404 에러)
• LibreOffice/Pandoc은 클라우드 환경에서 설치/실행 불가

💡 **권장 해결책:**
1. HWP 파일을 DOCX로 변환 후 업로드
2. HWP 파일을 PDF로 변환 후 업로드 (OCR 필요할 수 있음)
3. HWP 파일 내용을 텍스트로 복사하여 TXT 파일로 저장 후 업로드

현재 지원되는 파일 형식: DOCX, PDF, XLSX, TXT, CSV, HWPX`
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
        // 방법 1: hwp.js로 파싱 시도 (개선된 버전)
        const base64 = buffer.toString('base64')
        const doc = parseHwp(base64 as any)

        if (doc && typeof doc === 'object') {
          console.log('hwp.js 파싱 성공, 구조 확인 중...')

          // 본문 텍스트만 추출하는 함수
          const extractTextFromHwpDoc = (hwpDoc: any): string => {
            let result: string[] = []

            // 구조 1: sections 구조
            if (hwpDoc.sections && Array.isArray(hwpDoc.sections)) {
              hwpDoc.sections.forEach((section: any) => {
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

                // 기타 텍스트 필드들 확인 (한글이 포함된 것만)
                Object.keys(section).forEach((key) => {
                  const value = section[key]
                  if (typeof value === 'string' && value.trim() && value.length > 5) {
                    if (/[가-힣]/.test(value)) {
                      result.push(value.trim())
                    }
                  }
                })
              })
            }

            // 구조 2: bodyText 구조
            else if (hwpDoc.bodyText && Array.isArray(hwpDoc.bodyText.sections)) {
              hwpDoc.bodyText.sections.forEach((section: any) => {
                if (section.paragraphs && Array.isArray(section.paragraphs)) {
                  section.paragraphs.forEach((para: any) => {
                    if (para.text && typeof para.text === 'string') {
                      result.push(para.text.trim())
                    }
                  })
                }
              })
            }

            // 구조 3: 직접 텍스트 필드
            else if (hwpDoc.text && typeof hwpDoc.text === 'string') {
              result.push(hwpDoc.text.trim())
            }

            // 구조 4: 재귀적으로 모든 문자열 필드 찾기 (마지막 수단)
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

              result = extractTextRecursively(hwpDoc)
            }

            // 결과 정리: 중복 제거, 빈 문자열 제거, 의미있는 텍스트만 유지
            const cleanedResult = result
              .filter((text) => text && text.trim() && text.length > 3) // 최소 3자 이상
              .filter((text) => /[가-힣]/.test(text)) // 한글이 포함된 텍스트만
              .filter((text, index, arr) => arr.indexOf(text) === index) // 중복 제거
              .map((text) => text.trim())

            return cleanedResult.join('\n')
          }

          text = extractTextFromHwpDoc(doc)

          // 후처리 함수로 깨진 텍스트 정리
          text = cleanHwpText(text)

          if (text.trim()) {
            console.log('hwp.js로 본문 텍스트 추출 성공, 길이:', text.length)
            console.log('추출된 텍스트 샘플:', text.substring(0, 200))
            return text.trim()
          } else {
            console.log('hwp.js 파싱은 성공했으나 본문 텍스트를 찾을 수 없음')
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

        // 마지막 시도: 더 강력한 바이너리 파싱
        const lastResortText = extractTextFromHwpBinary(buffer)
        if (lastResortText && lastResortText.trim() && lastResortText.length > 50) {
          console.log('마지막 시도로 텍스트 추출 성공, 길이:', lastResortText.length)
          return lastResortText.trim()
        }

        return getHwpErrorMessage(filePath.split('/').pop() || 'unknown.hwp')
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
export function extractTextFromHwpBinary(buffer: Buffer): string {
  try {
    console.log('바이너리 파싱 개선 시도...')

    // 방법 1: 다양한 인코딩 시도
    const encodings = ['utf8', 'ascii', 'latin1', 'binary']

    for (const encoding of encodings) {
      try {
        const text = buffer.toString(encoding as BufferEncoding)

        // 한글 문자가 포함되어 있는지 확인
        const koreanChars = text.match(/[가-힣]/g)
        if (koreanChars && koreanChars.length > 10) {
          console.log(`${encoding} 인코딩으로 한글 텍스트 추출 성공: ${koreanChars.length} 개`)

          // 텍스트 정리 및 필터링
          const cleanedText = cleanExtractedText(text)
          if (cleanedText.length > 50) {
            return cleanedText
          }
        }
      } catch (e) {
        console.log(`${encoding} 인코딩 실패:`, e)
      }
    }

    // 방법 2: 바이너리에서 직접 한글 패턴 찾기 (EUC-KR/CP949)
    try {
      const koreanBytes = []
      for (let i = 0; i < buffer.length - 1; i++) {
        const byte1 = buffer[i]
        const byte2 = buffer[i + 1]

        // 한글 완성형 코드 (EUC-KR 기준)
        if (byte1 >= 0xb0 && byte1 <= 0xc8 && byte2 >= 0xa1 && byte2 <= 0xfe) {
          koreanBytes.push(byte1, byte2)
        }
        // 추가 한글 범위
        else if (byte1 >= 0xc9 && byte1 <= 0xd3 && byte2 >= 0xa1 && byte2 <= 0xfe) {
          koreanBytes.push(byte1, byte2)
        }
      }

      if (koreanBytes.length > 0) {
        // EUC-KR을 UTF-8로 변환 시도
        const koreanBuffer = Buffer.from(koreanBytes)
        const koreanText = koreanBuffer.toString('utf-8')
        console.log('바이너리 직접 파싱으로 한글 텍스트 추출 성공:', koreanText.length)

        const cleanedText = cleanExtractedText(koreanText)
        if (cleanedText.length > 50) {
          return cleanedText
        }
      }
    } catch (binaryError) {
      console.log('바이너리 직접 파싱 실패:', binaryError)
    }

    // 방법 3: 전체 버퍼에서 한글 패턴 찾기 (더 큰 범위)
    try {
      const bufferString = buffer.toString('utf-8', 0, Math.min(buffer.length, 100000))
      const koreanPattern = /[가-힣]+/g
      const matches = bufferString.match(koreanPattern)

      if (matches && matches.length > 0) {
        console.log('전체 버퍼에서 한글 텍스트 추출 성공:', matches.length, '개')
        const result = matches.join(' ')
        const cleanedText = cleanExtractedText(result)
        if (cleanedText.length > 50) {
          return cleanedText
        }
      }
    } catch (bufferError) {
      console.log('전체 버퍼 파싱 실패:', bufferError)
    }

    // 방법 4: 바이너리에서 텍스트 블록 찾기
    try {
      const textBlocks = []
      let currentBlock = ''

      for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i]

        // 텍스트 가능한 바이트 범위
        if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
          currentBlock += String.fromCharCode(byte)
        } else {
          if (currentBlock.length > 10) {
            // 한글이 포함된 블록만 저장
            if (/[가-힣]/.test(currentBlock)) {
              textBlocks.push(currentBlock)
            }
          }
          currentBlock = ''
        }
      }

      if (textBlocks.length > 0) {
        const result = textBlocks.join(' ')
        const cleanedText = cleanExtractedText(result)
        if (cleanedText.length > 50) {
          console.log('텍스트 블록 추출 성공:', textBlocks.length, '개 블록')
          return cleanedText
        }
      }
    } catch (blockError) {
      console.log('텍스트 블록 추출 실패:', blockError)
    }

    // 방법 5: 한글 문장 패턴 찾기 (새로 추가)
    try {
      const bufferString = buffer.toString('utf-8', 0, Math.min(buffer.length, 200000))

      // 한글 문장 패턴 찾기 (한글이 포함된 연속된 텍스트)
      const koreanSentencePattern = /[가-힣][^가-힣]*[가-힣][^가-힣]*[가-힣][^가-힣]*[가-힣]/g
      const sentences = bufferString.match(koreanSentencePattern)

      if (sentences && sentences.length > 0) {
        console.log('한글 문장 패턴 추출 성공:', sentences.length, '개 문장')

        // 문장들을 정리하고 필터링
        const cleanedSentences = sentences
          .map((sentence) => sentence.trim())
          .filter((sentence) => {
            const koreanChars = sentence.match(/[가-힣]/g)
            return koreanChars && koreanChars.length >= 5 && sentence.length >= 15
          })
          .filter((sentence) => !/[A-Za-z0-9]{10,}/.test(sentence)) // 바이너리 데이터 제거

        if (cleanedSentences.length > 0) {
          const result = cleanedSentences.join('. ')
          const cleanedText = cleanExtractedText(result)
          if (cleanedText.length > 50) {
            return cleanedText
          }
        }
      }
    } catch (patternError) {
      console.log('한글 문장 패턴 추출 실패:', patternError)
    }

    console.log('모든 인코딩 방법 실패')
    return ''
  } catch (error) {
    console.log('바이너리 텍스트 추출 중 오류:', error)
    return ''
  }
}

// 추출된 텍스트 정리 함수
function cleanExtractedText(text: string): string {
  return (
    text
      // 1단계: 바이너리 패턴 제거 (더 강력하게)
      .replace(/[A-Za-z0-9]{15,}/g, ' ') // 15자 이상의 연속된 영숫자 제거
      .replace(/[0-9A-Fa-f]{6,}/g, ' ') // 6자 이상의 16진수 패턴 제거
      .replace(/[A-Za-z]{3,}\s+[A-Za-z]{3,}/g, ' ') // 연속된 영문 단어 제거
      .replace(/[A-Za-z0-9]{5,}[^가-힣\s]{5,}/g, ' ') // 한글이 아닌 연속된 문자 제거

      // 2단계: HWP 파일 구조 정보 제거
      .replace(/루트\s*항목\s*:\s*:1\s*파일\s*헤더/g, ' ')
      .replace(/HH\s*wp\s*요약\s*정보/g, ' ')
      .replace(/\.DD\s*oc\s*정보/g, ' ')
      .replace(/Body\s*Text/g, ' ')
      .replace(/Bin\s*Data/g, ' ')
      .replace(/Prv\s*Image/g, ' ')
      .replace(/Prv\s*Text/g, ' ')
      .replace(/PNG\s*IHDR/g, ' ')
      .replace(/sRGB\s*gAMA/g, ' ')
      .replace(/a\s*pHYs/g, ' ')
      .replace(/od\s*VfF/g, ' ')
      .replace(/PP\s*j\s*A/g, ' ')
      .replace(/Eho!ZX/g, ' ')
      .replace(/YNL\s*y\s*A\s*C/g, ' ')
      .replace(/F\s*z\s*:\s*{;H}/g, ' ')
      .replace(/JPw\s*QG/g, ' ')
      .replace(/lbbl\s*g1\s*KB/g, ' ')
      .replace(/wm\s*S\s*LQ/g, ' ')
      .replace(/VHO\s*WH/g, ' ')

      // 3단계: 날짜/시간 패턴 제거
      .replace(/\d{4}\s*-\s*\d{1,2}\s*-\s*\d{1,2}/g, ' ')
      .replace(/\d{4}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}/g, ' ')
      .replace(/\d{1,2}\s*:\s*\d{1,2}\s*:\s*\d{1,2}/g, ' ')
      .replace(/\d{1,2}\s*:\s*\d{1,2}/g, ' ')

      // 4단계: 특수문자 및 기호 정리
      .replace(/[^\w\s가-힣.,!?;:()[\]{}"'\-]/g, ' ')
      .replace(/\s+/g, ' ') // 연속된 공백을 하나로
      .trim()

      // 5단계: 한글 문장만 추출
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

        // 바이너리 데이터가 포함된 문장 제거
        if (/[A-Za-z0-9]{8,}/.test(sentence)) return false

        return true
      })
      .filter((sentence, index, arr) => arr.indexOf(sentence) === index) // 중복 제거
      .join('. ')
      .trim()
  )
}
