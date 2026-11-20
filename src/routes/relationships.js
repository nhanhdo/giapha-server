import { Router } from 'express';
import { z } from 'zod';
import { tx } from '../db/pool.js';
import { requirePerm } from '../middleware/auth.js';
import { HttpError, intParam } from '../utils/http.js';
import { audit, linkParent, marriageSchema } from '../services/memberService.js';

const r = Router();
r.use(requirePerm('member:write'));

/**
 * POST /api/relationships/parent-child
 * { parentId, childId, relationType, setAsLineageParent? }
 * Dùng để nối thêm cha/mẹ nuôi, cha/mẹ kế, hoặc chuyển nhánh (setAsLineageParent=true).
 */
r.post('/parent-child', async (req, res) => {
  const b = z
    .object({
      parentId: z.number().int(),
      childId: z.number().int(),
      relationType: z.enum(['biological', 'adopted', 'step']).default('biological'),
      otherParentId: z.number().int().nullish(),
      setAsLineageParent: z.boolean().default(false),
    })
    .parse(req.body);
  await tx(async (e) => {
    await linkParent(e, b);
    if (b.setAsLineageParent) await e.q(`UPDATE members SET lineage_parent_id = $1, updated_by = $3 WHERE id = $2`, [b.parentId, b.childId, req.user.id]);
    await audit(e, req.user.id, 'parent_child.create', 'parent_child', b.childId, null, b);
  });
  res.status(201).json({ ok: true });
});

// DELETE /api/relationships/parent-child/:parentId/:childId
r.delete('/parent-child/:parentId/:childId', async (req, res) => {
  const parentId = intParam(req.params.parentId, 'parentId');
  const childId = intParam(req.params.childId, 'childId');
  await tx(async (e) => {
    const child = await e.one(`SELECT lineage_parent_id FROM members WHERE id = $1`, [childId]);
    if (child?.lineageParentId === parentId)
      throw new HttpError(409, 'Đây là cha/mẹ dòng tộc (vị trí trên cây). Hãy chuyển sang cha/mẹ khác trước khi gỡ.');
    await e.q(`DELETE FROM parent_child WHERE parent_id = $1 AND child_id = $2`, [parentId, childId]);
    await audit(e, req.user.id, 'parent_child.delete', 'parent_child', childId, { parentId, childId }, null);
  });
  res.status(204).end();
});

// PATCH /api/relationships/marriages/:id – đổi vợ cả/vợ lẽ, trạng thái (ly hôn, góa), ngày cưới...
r.patch('/marriages/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const b = marriageSchema.parse(req.body);
  const map = { wifeRank: 'wife_rank', marriageOrder: 'marriage_order', status: 'status', startDate: 'start_date', startYear: 'start_year', endDate: 'end_date', note: 'note' };
  const entries = Object.entries(b).filter(([k, v]) => map[k] && v !== undefined);
  if (!entries.length) throw new HttpError(400, 'Không có gì để cập nhật');
  const row = await tx(async (e) => {
    const before = await e.one(`SELECT * FROM marriages WHERE id = $1`, [id]);
    if (!before) throw new HttpError(404, 'Không tìm thấy hôn nhân');
    const after = await e.one(
      `UPDATE marriages SET ${entries.map(([k], i) => `${map[k]} = $${i + 1}`).join(', ')} WHERE id = $${entries.length + 1} RETURNING *`,
      [...entries.map(([, v]) => v), id],
    );
    await audit(e, req.user.id, 'marriage.update', 'marriage', id, before, after);
    return after;
  });
  res.json(row);
});

// DELETE /api/relationships/marriages/:id
r.delete('/marriages/:id', async (req, res) => {
  const id = intParam(req.params.id);
  await tx(async (e) => {
    const before = await e.one(`DELETE FROM marriages WHERE id = $1 RETURNING *`, [id]);
    if (!before) throw new HttpError(404, 'Không tìm thấy hôn nhân');
    await audit(e, req.user.id, 'marriage.delete', 'marriage', id, before, null);
  });
  res.status(204).end();
});

export default r;
