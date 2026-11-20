import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Parse body/query bằng zod, ném 400 nếu sai */
export const parse = (schema, data) => schema.parse(data);

export const intParam = (v, name = 'id') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Tham số ${name} không hợp lệ`);
  return n;
};

// Express 5 tự chuyển lỗi của async handler vào đây
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  // Lỗi PostgreSQL
  const pgMap = { 23505: [409, 'Dữ liệu bị trùng'], 23503: [409, 'Vi phạm ràng buộc liên kết'], 23514: [400, 'Vi phạm ràng buộc dữ liệu'], P0001: [400, null] };
  if (err.code && pgMap[err.code]) {
    const [status, msg] = pgMap[err.code];
    return res.status(status).json({ error: msg ?? err.message, details: err.detail ?? err.constraint });
  }
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
}
