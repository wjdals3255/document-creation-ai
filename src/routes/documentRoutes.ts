import express from 'express'
import { createDocument, getDocuments, getDocumentById, updateDocument, deleteDocument } from '../controllers/documentController'

const router = express.Router()

// GET /api/v1/documents - 모든 문서 목록 조회
router.get('/', getDocuments)

// GET /api/v1/documents/:id - 특정 문서 조회
router.get('/:id', getDocumentById)

// POST /api/v1/documents - 새 문서 생성
router.post('/', createDocument)

// PUT /api/v1/documents/:id - 문서 수정
router.put('/:id', updateDocument)

// DELETE /api/v1/documents/:id - 문서 삭제
router.delete('/:id', deleteDocument)

export default router
