import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { requirePerm, requireRead } from '../middleware/auth.js';
import { HttpError, intParam } from '../utils/http.js';

const r = Router();

// GET /api/branches – danh sách chi/nhánh + người khởi chi + số người
r.get('/', requireRead, async (_req, res) => {
  res.json(
    await db.q(
      `SELECT b.id, b.name, b.parent_id, b.description, b.sort_order, b.founder_id,
              f.full_name AS founder_name, f.generation AS founder_generation,
              (SELECT count(*)::int FROM members m WHERE m.path <@ f.path) AS member_count
         FROM branches b JOIN members f ON f.id = b.founder_id
        ORDER BY f.path, b.sort_order`,
    ),
  );
});

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  founderId: z.number().int(),
  parentId: z.number().int().nullish(),
  description: z.string().max(2000).nullish(),
  sortOrder: z.number().int().default(0),
});

r.post('/', requirePerm('branch:write'), async (req, res) => {
  const b = schema.parse(req.body);
  const f = await db.one(`SELECT path FROM members WHERE id = $1`, [b.founderId]);
  if (!f?.path) throw new HttpError(400, 'Người khởi chi phải là người trong họ');
  res.status(201).json(
    await db.one(
      `INSERT INTO branches (name, founder_id, parent_id, description, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.name, b.founderId, b.parentId ?? null, b.description ?? null, b.sortOrder],
    ),
  );
});

r.patch('/:id', requirePerm('branch:write'), async (req, res) => {
  const b = schema.partial().parse(req.body);
  const row = await db.one(
    `UPDATE branches SET name = coalesce($2, name), founder_id = coalesce($3, founder_id),
            parent_id = CASE WHEN $6 THEN $4 ELSE parent_id END,
            description = coalesce($5, description)
      WHERE id = $1 RETURNING *`,
    [intParam(req.params.id), b.name ?? null, b.founderId ?? null, b.parentId ?? null, b.description ?? null, 'parentId' in b],
  );
  if (!row) throw new HttpError(404, 'Không tìm thấy chi');
  res.json(row);
});

r.delete('/:id', requirePerm('branch:write'), async (req, res) => {
  await db.q(`DELETE FROM branches WHERE id = $1`, [intParam(req.params.id)]);
  res.status(204).end();
});

export default r;
