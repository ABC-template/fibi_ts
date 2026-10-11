// ============================================
// api/_lib/http-error.ts
// Ошибка с HTTP-статусом: бросается из хелперов валидации,
// в обработчике превращается в errorResponse(message, status)
// Версия: 1.0.0
// ============================================

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
