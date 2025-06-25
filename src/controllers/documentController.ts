import { Request, Response } from 'express'
import { DocumentData, CreateDocumentRequest, UpdateDocumentRequest } from '../types/documentTypes'

// 임시 데이터 저장소 (실제로는 데이터베이스를 사용해야 합니다)
let documents: DocumentData[] = []
let nextId = 1

// 모든 문서 조회
export const getDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      success: true,
      data: documents,
      count: documents.length
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '문서 목록을 가져오는 중 오류가 발생했습니다.'
    })
  }
}

// 특정 문서 조회
export const getDocumentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const document = documents.find((doc) => doc.id === parseInt(id))

    if (!document) {
      res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.'
      })
      return
    }

    res.status(200).json({
      success: true,
      data: document
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '문서를 가져오는 중 오류가 발생했습니다.'
    })
  }
}

// 새 문서 생성
export const createDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const documentData: CreateDocumentRequest = req.body

    // 기본 유효성 검사
    if (!documentData.title || !documentData.content) {
      res.status(400).json({
        success: false,
        error: '제목과 내용은 필수입니다.'
      })
      return
    }

    const newDocument: DocumentData = {
      id: nextId++,
      title: documentData.title,
      content: documentData.content,
      type: documentData.type || 'general',
      status: documentData.status || 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: documentData.metadata || {}
    }

    documents.push(newDocument)

    res.status(201).json({
      success: true,
      data: newDocument,
      message: '문서가 성공적으로 생성되었습니다.'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '문서 생성 중 오류가 발생했습니다.'
    })
  }
}

// 문서 수정
export const updateDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const updateData: UpdateDocumentRequest = req.body

    const documentIndex = documents.findIndex((doc) => doc.id === parseInt(id))

    if (documentIndex === -1) {
      res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.'
      })
      return
    }

    const updatedDocument = {
      ...documents[documentIndex],
      ...updateData,
      id: parseInt(id), // ID는 변경 불가
      updatedAt: new Date().toISOString()
    }

    documents[documentIndex] = updatedDocument

    res.status(200).json({
      success: true,
      data: updatedDocument,
      message: '문서가 성공적으로 수정되었습니다.'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '문서 수정 중 오류가 발생했습니다.'
    })
  }
}

// 문서 삭제
export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const documentIndex = documents.findIndex((doc) => doc.id === parseInt(id))

    if (documentIndex === -1) {
      res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.'
      })
      return
    }

    const deletedDocument = documents.splice(documentIndex, 1)[0]

    res.status(200).json({
      success: true,
      data: deletedDocument,
      message: '문서가 성공적으로 삭제되었습니다.'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '문서 삭제 중 오류가 발생했습니다.'
    })
  }
}
