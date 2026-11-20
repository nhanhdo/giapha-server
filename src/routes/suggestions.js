import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db/pool.js';
import { can, requireAuth, requirePerm } from '../middleware/auth.js';
import { HttpError, intParam } from '../utils/http.js';
import { isInUserScope } from '../services/scopeService.js';
import {
  addChild, addChildSchema, addSpouse, getMemberRow, marriageSchema, memberCreateSchema, memberFields, updateMember,
} from '../services/memberService.js';

const r = Router();

const payloadSchemas = {
  update_member: z.object({ changes: memberFields.partial().refine((c) => Object.keys(c).length > 0, 'Chưa có thay đổi nào') }),
  add_child: addChildSchema,
  add_spouse: z.object({ member: memberCreateSchema, marriage: marriageSchema.default({}) }),
  other: z.object({ text: z.string().min(1).max(5000) }),
};

const createSchema = z.object({
  type: z.enum(['update_member', 'add_child', 'add_spouse', 'other']),
  targetMemberId: z.number().int(),
  payload: z.unknown(),
  reason: z.string().max(2000).nullish(),
});

/** POST /api/suggestions – Thành viên gửi đề xuất trong phạm vi nhánh của mình */
r.post('/', requirePerm('suggestion:create'), async (req, res) => {
  const b = createSchema.parse(req.body);
  const payload = payloadSchemas[b.type].parse(b.payload);
  await getMemberRow(db, b.targetMemberId);
  if (!(await isInUserScope(db, req.user, b.targetMemberId)))
    throw new HttpError(403, 'Bạn chỉ được đề xuất chỉnh sửa thông tin trong nhánh của mình');
  const row = await db.one(
    `INSERT INTO edit_suggestions (type, target_member_id, payload, reason, proposer_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.type, b.targetMemberId, JSON.stringify(payload), b.reason ?? null, req.user.id],
  );
  res.status(201).json(row);
});

/** GET /api/suggestions?status=pending – quản trị thấy tất cả, thành viên thấy đề xuất của mình */
r.get('/', requireAuth, async (req, res) => {
  const status = z.enum(['pending', 'approved', 'rejected']).optional().parse(req.query.status);
  const all = can(req.user, 'suggestion:review');
  const rows = await db.q(
    `SELECT s.*, u.display_name AS proposer_name, rv.display_name AS reviewer_name,
            to_jsonb(t) - 'path' AS target
       FROM edit_suggestions s
       JOIN users u ON u.id = s.proposer_id
       LEFT JOIN users rv ON rv.id = s.reviewer_id
       LEFT JOIN members t ON t.id = s.target_member_id
      WHERE ($1::suggestion_status_t IS NULL OR s.status = $1)
        AND ($2 OR s.proposer_id = $3)
      ORDER BY s.created_at DESC LIMIT 200`,
    [status ?? null, all, req.user.id],
  );
  res.json(rows);
});

async function loadPending(e, id) {
  const s = await e.one(`SELECT * FROM edit_suggestions WHERE id = $1 FOR UPDATE`, [id]);
  if (!s) throw new HttpError(404, 'Không tìm thấy đề xuất');
  if (s.status !== 'pending') throw new HttpError(409, 'Đề xuất đã được xử lý');
  return s;
}

/** POST /api/suggestions/:id/approve { note?, payload? (bản đã chỉnh sửa bởi người duyệt) } */
r.post('/:id/approve', requirePerm('suggestion:review'), async (req, res) => {
  const id = intParam(req.params.id);
  const { note, payload: override } = z.object({ note: z.string().max(2000).nullish(), payload: z.unknown().optional() }).parse(req.body ?? {});
  const result = await tx(async (e) => {
    const s = await loadPending(e, id);
    const payload = payloadSchemas[s.type].parse(override ?? s.payload);
    let applied = null;
    if (s.type === 'update_member') applied = await updateMember(e, s.targetMemberId, payload.changes, req.user.id);
    else if (s.type === 'add_child') applied = await addChild(e, s.targetMemberId, payload, req.user.id);
    else if (s.type === 'add_spouse') applied = await addSpouse(e, s.targetMemberId, payload, req.user.id);
    await e.q(
      `UPDATE edit_suggestions SET status = 'approved', reviewer_id = $2, review_note = $3, reviewed_at = now(), payload = $4 WHERE id = $1`,
      [id, req.user.id, note ?? null, JSON.stringify(payload)],
    );
    return applied;
  });
  res.json({ ok: true, applied: result });
});

/** POST /api/suggestions/:id/reject { note } */
r.post('/:id/reject', requirePerm('suggestion:review'), async (req, res) => {
  const id = intParam(req.params.id);
  const { note } = z.object({ note: z.string().max(2000).nullish() }).parse(req.body ?? {});
  await tx(async (e) => {
    await loadPending(e, id);
    await e.q(`UPDATE edit_suggestions SET status = 'rejected', reviewer_id = $2, review_note = $3, reviewed_at = now() WHERE id = $1`, [
      id, req.user.id, note ?? null,
    ]);
  });
  res.json({ ok: true });
});

export default r;
