import { Request, Response, NextFunction } from 'express'

// 커스텀 에러 클래스
export class AppError extends Error {
  statusCode: number
  isOperational: boolean

  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true

    Error.captureStackTrace(this, this.constructor)
  }
}

// 에러 핸들링 미들웨어
export const errorHandler = (err: Error | AppError, req: Request, res: Response, next: NextFunction): void => {
  let error = { ...err }
  error.message = err.message

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = '리소스를 찾을 수 없습니다'
    error = new AppError(message, 404)
  }

  // Mongoose duplicate key
  if ((err as any).code === 11000) {
    const message = '중복된 필드 값이 있습니다'
    error = new AppError(message, 400)
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values((err as any).errors)
      .map((val: any) => val.message)
      .join(', ')
    error = new AppError(message, 400)
  }

  const statusCode = (error as AppError).statusCode || 500
  const message = error.message || '서버 내부 오류'

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
}

// 404 에러 핸들러
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new AppError(`경로를 찾을 수 없습니다: ${req.originalUrl}`, 404)
  next(error)
}
