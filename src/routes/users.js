import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { requirePerm } from '../middleware/auth.js';
import { HttpError, intParam } from '../utils/http.js';

const r = Router();
r.use(requirePerm('user:manage'));

const COLS = `u.id, u.username, u.display_name, u.role, u.member_id, u.is_active, u.last_login_at, u.created_at, m.full_name AS member_name`;

r.get('/', async (_req, res) => {
  res.json(await db.q(`SELECT ${COLS} FROM users u LEFT JOIN members m ON m.id = u.member_id ORDER BY u.role, u.username`));
});

const schema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(200),
  role: z.enum(['admin', 'secretary', 'member']).default('member'),
  memberId: z.number().int().nullish(),
  isActive: z.boolean().default(true),
});

r.post('/', async (req, res) => {
  const b = schema.parse(req.body);
  const row = await db.one(
    `INSERT INTO users (username, password_hash, display_name, role, member_id, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [b.username, await bcrypt.hash(b.password, 10), b.displayName, b.role, b.memberId ?? null, b.isActive],
  );
  res.status(201).json(row);
});

r.patch('/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const b = schema.partial().parse(req.body);
  if (id === req.user.id && (b.role && b.role !== 'admin' || b.isActive === false))
    throw new HttpError(400, 'Không thể tự hạ quyền hoặc khóa tài khoản của chính mình');
  const map = { username: 'username', displayName: 'display_name', role: 'role', memberId: 'member_id', isActive: 'is_active' };
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(b)) {
    if (k === 'password') continue;
    if (map[k] && v !== undefined) {
      vals.push(v);
      sets.push(`${map[k]} = $${vals.length}`);
    }
  }
  if (b.password) {
    vals.push(await bcrypt.hash(b.password, 10));
    sets.push(`password_hash = $${vals.length}`);
  }
  if (!sets.length) throw new HttpError(400, 'Không có gì để cập nhật');
  vals.push(id);
  const row = await db.one(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id`, vals);
  if (!row) throw new HttpError(404, 'Không tìm thấy tài khoản');
  res.json(row);
});

export default r;
