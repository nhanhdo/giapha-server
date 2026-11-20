import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { requireAuth, signToken, PERMISSIONS } from '../middleware/auth.js';
import { HttpError } from '../utils/http.js';

const r = Router();

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
  memberId: u.memberId,
  calendarToken: u.calendarToken,
  permissions: Object.entries(PERMISSIONS).filter(([, roles]) => roles.includes(u.role)).map(([p]) => p),
});

/**
 * Chống dò mật khẩu: đếm lần đăng nhập SAI trong cửa sổ 15 phút.
 *  - cùng IP + tên đăng nhập: tối đa 5 lần
 *  - cùng IP (mọi tên đăng nhập): tối đa 20 lần
 * Lưu trong bộ nhớ – đủ cho 1 instance trên Railway; nhiều instance thì chuyển sang Redis.
 */
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { pair: 5, ip: 20 };
const failures = new Map(); // key -> { count, resetAt }
const hit = (key) => {
  const now = Date.now();
  const e = failures.get(key);
  if (!e || e.resetAt <= now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else e.count += 1;
};
const blockedFor = (key, max) => {
  const e = failures.get(key);
  return e && e.resetAt > Date.now() && e.count >= max ? e.resetAt - Date.now() : 0;
};
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of failures) if (e.resetAt <= now) failures.delete(k);
}, 60_000).unref();

// POST /api/auth/login { username, password }
r.post('/login', async (req, res) => {
  const { username, password } = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }).parse(req.body);
  const ipKey = `ip:${req.ip}`;
  const pairKey = `pair:${req.ip}:${username.toLowerCase()}`;
  const wait = Math.max(blockedFor(pairKey, LIMITS.pair), blockedFor(ipKey, LIMITS.ip));
  if (wait) {
    res.setHeader('Retry-After', Math.ceil(wait / 1000));
    throw new HttpError(429, `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(wait / 60000)} phút.`);
  }
  const u = await db.one(`SELECT * FROM users WHERE username = $1 AND is_active`, [username]);
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
    hit(pairKey);
    hit(ipKey);
    throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  }
  failures.delete(pairKey);
  await db.q(`UPDATE users SET last_login_at = now() WHERE id = $1`, [u.id]);
  res.json({ token: signToken(u), user: publicUser(u) });
});

// GET /api/auth/me
r.get('/me', requireAuth, async (req, res) => {
  const u = await db.one(`SELECT * FROM users WHERE id = $1 AND is_active`, [req.user.id]);
  if (!u) throw new HttpError(401, 'Tài khoản không còn hiệu lực');
  res.json({ user: publicUser(u) });
});

// PATCH /api/auth/password { currentPassword, newPassword } – tự đổi mật khẩu
r.patch('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, 'Mật khẩu mới tối thiểu 8 ký tự').max(200) })
    .parse(req.body);
  const u = await db.one(`SELECT * FROM users WHERE id = $1 AND is_active`, [req.user.id]);
  if (!u || !(await bcrypt.compare(currentPassword, u.passwordHash))) throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  await db.q(`UPDATE users SET password_hash = $1 WHERE id = $2`, [await bcrypt.hash(newPassword, 10), u.id]);
  res.json({ ok: true });
});

export default r;
