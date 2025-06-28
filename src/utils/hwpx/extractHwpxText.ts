import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
// 실제 hwpx-owpml-model의 경로에 맞게 import 경로를 수정하세요.
// 예: import { HwpDocument } from './hwpx-owpml-model';

// 아래는 예시 import (실제 파일 복사 후 경로에 맞게 수정 필요)
// import { HwpDocument } from './hwpx-owpml-model';

/**
 * HWPX 파일에서 본문 텍스트를 추출합니다.
 * @param filePath HWPX 파일 경로
 * @returns 추출된 텍스트(문자열)
 */
export async function extractHwpxText(filePath: string): Promise<string> {
  // HWPX는 zip 포맷이므로 압축 해제
  const zip = new AdmZip(filePath)
  const contentsXmlEntry = zip.getEntry('Contents.xml')
  if (!contentsXmlEntry) {
    throw new Error('Contents.xml을 찾을 수 없습니다. 올바른 HWPX 파일인지 확인하세요.')
  }
  const contentsXml = contentsXmlEntry.getData().toString('utf-8')

  // XML 파싱
  const xml = await parseStringPromise(contentsXml, { explicitArray: false })

  // 본문 텍스트 추출 (섹션 > 문단 > 텍스트)
  let text = ''
  try {
    const body = xml?.HWPML?.BODY
    const sections = Array.isArray(body?.SECTION) ? body.SECTION : [body?.SECTION]
    for (const section of sections) {
      const paragraphs = Array.isArray(section?.P) ? section.P : [section?.P]
      for (const p of paragraphs) {
        if (p && p['#text']) {
          text += p['#text'] + '\n'
        } else if (p && p.RUN) {
          // RUN이 여러 개일 수 있음
          const runs = Array.isArray(p.RUN) ? p.RUN : [p.RUN]
          for (const run of runs) {
            if (run['#text']) text += run['#text']
          }
          text += '\n'
        }
      }
    }
  } catch (e) {
    throw new Error('본문 텍스트 추출 중 오류: ' + e)
  }
  return text.trim()
}
