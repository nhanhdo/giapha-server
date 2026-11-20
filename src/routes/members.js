import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db/pool.js';
import { requirePerm, requireRead } from '../middleware/auth.js';
import { intParam } from '../utils/http.js';
import {
  addChild, addChildSchema, addSpouse, addSpouseSchema, createMember, deleteMember, getMemberDetail,
  getTree, memberCreateSchema, memberUpdateSchema, updateMember,
} from '../services/memberService.js';
import { isInUserScope } from '../services/scopeService.js';

const r = Router();

/**
 * GET /api/tree?rootId=&depth=
 * Toàn bộ cây (hoặc 1 nhánh) dạng phẳng: { members[], marriages[] } – client dựng hierarchy.
 */
r.get('/tree', requireRead, async (req, res) => {
  const q = z.object({ rootId: z.coerce.number().int().optional(), depth: z.coerce.number().int().min(1).optional() }).parse(req.query);
  res.json(await getTree(db, q));
});

/**
 * GET /api/members?q=&generation=&branchId=&isAlive=&limit=&offset=
 * Tìm kiếm không dấu (trigram) theo họ tên / tên tự / tên hiệu.
 */
r.get('/members', requireRead, async (req, res) => {
  const q = z
    .object({
      q: z.string().trim().optional(),
      generation: z.coerce.number().int().optional(),
      branchId: z.coerce.number().int().optional(),
      isAlive: z.enum(['true', 'false']).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(30),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .parse(req.query);
  const rows = await db.q(
    `SELECT m.id, m.full_name, m.courtesy_name, m.pen_name, m.gender, m.generation, m.is_alive,
            m.birth_year, m.death_year, m.is_lineage, b.branch_id, b.branch_name,
            CASE WHEN $1::text IS NULL THEN 0 ELSE similarity(f_unaccent(m.full_name), f_unaccent($1)) END AS score
       FROM members m
       LEFT JOIN v_member_branch b ON b.member_id = m.id
      WHERE ($1::text IS NULL OR f_unaccent(m.full_name || ' ' || coalesce(m.courtesy_name,'') || ' ' || coalesce(m.pen_name,''))
                                 LIKE '%' || f_unaccent($1) || '%'
                              OR similarity(f_unaccent(m.full_name), f_unaccent($1)) > 0.45)
        AND ($2::int IS NULL OR m.generation = $2)
        AND ($3::int IS NULL OR b.branch_id = $3)
        AND ($4::bool IS NULL OR m.is_alive = $4)
      ORDER BY score DESC, m.generation, m.full_name
      LIMIT $5 OFFSET $6`,
    [q.q || null, q.generation ?? null, q.branchId ?? null, q.isAlive ? q.isAlive === 'true' : null, q.limit, q.offset],
  );
  res.json({ items: rows });
});

// GET /api/members/:id – chi tiết: tiểu sử, cha mẹ, vợ/chồng, các con, anh chị em, tổ tiên
r.get('/members/:id', requireRead, async (req, res) => {
  const detail = await getMemberDetail(db, intParam(req.params.id));
  if (req.user) detail.canSuggest = await isInUserScope(db, req.user, detail.id);
  res.json(detail);
});

// POST /api/members – tạo thành viên gốc (thủy tổ) hoặc người độc lập
r.post('/members', requirePerm('member:write'), async (req, res) => {
  const data = memberCreateSchema.parse(req.body);
  res.status(201).json(await tx((e) => createMember(e, data, req.user.id, { isLineage: true })));
});

// PATCH /api/members/:id
r.patch('/members/:id', requirePerm('member:write'), async (req, res) => {
  const data = memberUpdateSchema.parse(req.body);
  res.json(await tx((e) => updateMember(e, intParam(req.params.id), data, req.user.id)));
});

// DELETE /api/members/:id – chặn nếu còn con cháu
r.delete('/members/:id', requirePerm('member:write'), async (req, res) => {
  await tx((e) => deleteMember(e, intParam(req.params.id), req.user.id));
  res.status(204).end();
});

// POST /api/members/:id/children { member, otherParentId?, relationType }
r.post('/members/:id/children', requirePerm('member:write'), async (req, res) => {
  const body = addChildSchema.parse(req.body);
  res.status(201).json(await tx((e) => addChild(e, intParam(req.params.id), body, req.user.id)));
});

// POST /api/members/:id/spouses { member | existingMemberId, marriage: { wifeRank, marriageOrder, status, ... } }
r.post('/members/:id/spouses', requirePerm('member:write'), async (req, res) => {
  const body = addSpouseSchema.parse(req.body);
  res.status(201).json(await tx((e) => addSpouse(e, intParam(req.params.id), body, req.user.id)));
});

export default r;
