import fs from 'fs'
import { parse } from 'hwp.js'

export async function extractHwpText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath)
  const base64 = buffer.toString('base64')
  // 타입 에러 우회: base64를 any로 단언
  const doc = parse(base64 as any)
  let text = ''

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
}
