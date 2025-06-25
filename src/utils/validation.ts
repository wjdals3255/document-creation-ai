import { CreateDocumentRequest, UpdateDocumentRequest } from '../types/documentTypes'

// 문서 생성 요청 유효성 검사
export const validateCreateDocument = (data: CreateDocumentRequest): { isValid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!data.title || data.title.trim().length === 0) {
    errors.push('제목은 필수입니다')
  }

  if (!data.content || data.content.trim().length === 0) {
    errors.push('내용은 필수입니다')
  }

  if (data.title && data.title.length > 200) {
    errors.push('제목은 200자를 초과할 수 없습니다')
  }

  if (data.content && data.content.length > 10000) {
    errors.push('내용은 10,000자를 초과할 수 없습니다')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

// 문서 수정 요청 유효성 검사
export const validateUpdateDocument = (data: UpdateDocumentRequest): { isValid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (data.title !== undefined) {
    if (data.title.trim().length === 0) {
      errors.push('제목은 비어있을 수 없습니다')
    }
    if (data.title.length > 200) {
      errors.push('제목은 200자를 초과할 수 없습니다')
    }
  }

  if (data.content !== undefined) {
    if (data.content.trim().length === 0) {
      errors.push('내용은 비어있을 수 없습니다')
    }
    if (data.content.length > 10000) {
      errors.push('내용은 10,000자를 초과할 수 없습니다')
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

// ID 유효성 검사
export const validateId = (id: string): boolean => {
  const numId = parseInt(id)
  return !isNaN(numId) && numId > 0
}

// 페이지네이션 파라미터 유효성 검사
export const validatePaginationParams = (page?: string, limit?: string): { page: number; limit: number } => {
  const pageNum = page ? parseInt(page) : 1
  const limitNum = limit ? parseInt(limit) : 10

  return {
    page: pageNum > 0 ? pageNum : 1,
    limit: limitNum > 0 && limitNum <= 100 ? limitNum : 10
  }
}
