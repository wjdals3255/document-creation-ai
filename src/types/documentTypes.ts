// 문서 상태 타입
export type DocumentStatus = 'draft' | 'published' | 'archived' | 'deleted'

// 문서 타입
export type DocumentType = 'general' | 'report' | 'proposal' | 'manual' | 'policy'

// 메타데이터 타입
export interface DocumentMetadata {
  author?: string
  department?: string
  tags?: string[]
  version?: string
  [key: string]: any
}

// 문서 데이터 인터페이스
export interface DocumentData {
  id: number
  title: string
  content: string
  type: DocumentType
  status: DocumentStatus
  createdAt: string
  updatedAt: string
  metadata: DocumentMetadata
}

// 문서 생성 요청 인터페이스
export interface CreateDocumentRequest {
  title: string
  content: string
  type?: DocumentType
  status?: DocumentStatus
  metadata?: DocumentMetadata
}

// 문서 수정 요청 인터페이스
export interface UpdateDocumentRequest {
  title?: string
  content?: string
  type?: DocumentType
  status?: DocumentStatus
  metadata?: DocumentMetadata
}

// API 응답 인터페이스
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  count?: number
}

// 페이지네이션 인터페이스
export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// 문서 검색 인터페이스
export interface DocumentSearchParams extends PaginationParams {
  title?: string
  type?: DocumentType
  status?: DocumentStatus
  author?: string
  tags?: string[]
}
