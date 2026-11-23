import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/pool.js';
import { HttpError } from '../utils/http.js';

/**
 * Ma trận quyền (RBAC)
 *  admin     – Tộc trưởng : toàn quyền, quản lý tài khoản
 *  secretary – Thư ký     : thêm/sửa/xóa thành viên & quan hệ, duyệt đề xuất
 *  member    – Thành viên : xem cây, gửi đề xuất chỉnh sửa trong phạm vi nhánh của mình
 */
export const PERMISSIONS = {
  'tree:read': ['admin', 'secretary', 'member'],
  'member:write': ['admin', 'secretary'],
  'suggestion:create': ['admin', 'secretary', 'member'],
  'suggestion:review': ['admin', 'secretary'],
  'branch:write': ['admin', 'secretary'],
  'user:manage': ['admin'],
};

export const can = (user, perm) => !!user && PERMISSIONS[perm]?.includes(user.role);

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, authVersion: user.authVersion },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

/** Gắn req.user nếu có Bearer token hợp lệ (không bắt buộc) */
export async function authOptional(req, _res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next();

  let token;
  try {
    token = jwt.verify(h.slice(7), config.jwtSecret);
  } catch {
    return next();
  }
  if (!Number.isInteger(token.sub) || !Number.isInteger(token.authVersion)) return next();

  const user = await db.one(
    `SELECT id, role, member_id, display_name, auth_version FROM users WHERE id = $1 AND is_active`,
    [token.sub],
  );
  if (user?.authVersion === token.authVersion) req.user = user;
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Vui lòng đăng nhập');
  next();
}

export const requirePerm = (perm) => (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Vui lòng đăng nhập');
  if (!can(req.user, perm)) throw new HttpError(403, 'Bạn không có quyền thực hiện thao tác này');
  next();
};

/** Quyền đọc cây: công khai hoặc chỉ thành viên đăng nhập (READ_ACCESS) */
export function requireRead(req, _res, next) {
  if (config.readAccess === 'public') return next();
  if (!req.user) throw new HttpError(401, 'Gia phả chỉ dành cho thành viên – vui lòng đăng nhập');
  next();
}
