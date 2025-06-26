import fs from 'fs'
import { parse } from 'hwp.js'

export async function extractHwpText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath)
  const doc = parse(buffer)
  let text = ''

  if (doc && doc.sections) {
    for (const section of doc.sections) {
      for (const key in section) {
        const value = section[key]
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
  return text.trim()
}
