import { z } from 'zod';
import { fillDatePair, parseISO } from '../shared/lunar.js';
import { HttpError } from '../utils/http.js';

// ---------------------------------------------------------------------------
//  Validation
// ---------------------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng YYYY-MM-DD');
const opt = (s) => s.nullish();
const lunarDay = z.coerce.number().int().min(1).max(30);
const lunarMonth = z.coerce.number().int().min(1).max(12);
const year = z.coerce.number().int().min(1000).max(2300);

export const memberFields = z.object({
  fullName: z.string().trim().min(1).max(200),
  courtesyName: opt(z.string().max(200)),
  penName: opt(z.string().max(200)),
  posthumousName: opt(z.string().max(200)),
  commonName: opt(z.string().max(200)),
  gender: z.enum(['male', 'female']),
  birthOrder: opt(z.coerce.number().int().min(1).max(50)),
  birthDate: opt(isoDate),
  birthYear: opt(year),
  birthLunarDay: opt(lunarDay),
  birthLunarMonth: opt(lunarMonth),
  birthLunarYear: opt(year),
  birthLunarLeap: opt(z.boolean()),
  isAlive: opt(z.boolean()),
  deathDate: opt(isoDate),
  deathYear: opt(year),
  deathLunarDay: opt(lunarDay),
  deathLunarMonth: opt(lunarMonth),
  deathLunarYear: opt(year),
  deathLunarLeap: opt(z.boolean()),
  generation: opt(z.coerce.number().int().min(1).max(200)),
  hometown: opt(z.string().max(500)),
  occupation: opt(z.string().max(500)),
  burialPlace: opt(z.string().max(500)),
  biography: opt(z.string().max(20000)),
  avatarUrl: opt(z.string().max(2000)),
  note: opt(z.string().max(5000)),
});
export const memberCreateSchema = memberFields;
export const memberUpdateSchema = memberFields.partial().extend({ lineageParentId: opt(z.coerce.number().int()) });

export const marriageSchema = z.object({
  wifeRank: opt(z.coerce.number().int().min(1).max(10)),
  marriageOrder: opt(z.coerce.number().int().min(1).max(10)),
  status: opt(z.enum(['married', 'divorced', 'widowed', 'separated'])),
  startDate: opt(isoDate),
  startYear: opt(year),
  endDate: opt(isoDate),
  note: opt(z.string().max(2000)),
});

export const addChildSchema = z.object({
  member: memberCreateSchema,
  otherParentId: opt(z.coerce.number().int()),
  relationType: z.enum(['biological', 'adopted', 'step']).default('biological'),
});

export const addSpouseSchema = z
  .object({
    member: memberCreateSchema.optional(),
    existingMemberId: opt(z.coerce.number().int()),
    marriage: marriageSchema.default({}),
  })
  .refine((v) => v.member || v.existingMemberId, 'Cần member hoặc existingMemberId');

// ---------------------------------------------------------------------------
//  Mapping camelCase <-> snake_case
// ---------------------------------------------------------------------------
const COLUMN = {
  fullName: 'full_name', courtesyName: 'courtesy_name', penName: 'pen_name', posthumousName: 'posthumous_name',
  commonName: 'common_name', gender: 'gender', birthOrder: 'birth_order',
  birthDate: 'birth_date', birthYear: 'birth_year', birthLunarDay: 'birth_lunar_day', birthLunarMonth: 'birth_lunar_month',
  birthLunarYear: 'birth_lunar_year', birthLunarLeap: 'birth_lunar_leap',
  isAlive: 'is_alive', deathDate: 'death_date', deathYear: 'death_year', deathLunarDay: 'death_lunar_day',
  deathLunarMonth: 'death_lunar_month', deathLunarYear: 'death_lunar_year', deathLunarLeap: 'death_lunar_leap',
  generation: 'generation', isLineage: 'is_lineage', lineageParentId: 'lineage_parent_id',
  hometown: 'hometown', occupation: 'occupation', burialPlace: 'burial_place', biography: 'biography',
  avatarUrl: 'avatar_url', note: 'note',
};
export const EDITABLE_FIELDS = Object.keys(COLUMN).filter((k) => !['isLineage'].includes(k));

const DEATH_FIELDS = ['deathDate', 'deathYear', 'deathLunarDay', 'deathLunarMonth', 'deathLunarYear', 'deathLunarLeap'];

/** Chuẩn hóa ngày: tự quy đổi Âm <-> Dương, suy ra năm, đồng bộ trạng thái sống/mất. */
export function normalizeDates(input, existing = {}) {
  const d = { ...input };
  const merged = { ...existing, ...input };

  const pair = (prefix) => {
    const lunarKeys = [`${prefix}LunarDay`, `${prefix}LunarMonth`, `${prefix}LunarYear`, `${prefix}LunarLeap`];
    const solarTouched = `${prefix}Date` in input;
    const lunarTouched = lunarKeys.some((k) => k in input);
    if (!solarTouched && !lunarTouched) return;
    // Bên nào vừa được sửa thì bên kia được tính lại (không giữ giá trị cũ đã lệch)
    const src = { ...merged };
    if (solarTouched && !lunarTouched && input[`${prefix}Date`]) for (const k of lunarKeys) src[k] = null;
    if (lunarTouched && !solarTouched && merged[`${prefix}LunarDay`]) src[`${prefix}Date`] = null;
    const r = fillDatePair({
      solar: src[`${prefix}Date`],
      lunarDay: src[`${prefix}LunarDay`],
      lunarMonth: src[`${prefix}LunarMonth`],
      lunarYear: src[`${prefix}LunarYear`],
      lunarLeap: src[`${prefix}LunarLeap`],
    });
    d[`${prefix}Date`] = r.solar ?? null;
    d[`${prefix}LunarDay`] = r.lunarDay ?? null;
    d[`${prefix}LunarMonth`] = r.lunarMonth ?? null;
    d[`${prefix}LunarYear`] = r.lunarYear ?? null;
    d[`${prefix}LunarLeap`] = !!r.lunarLeap;
    // Năm (dùng khi chỉ biết năm) luôn khớp với ngày đầy đủ, trừ khi người dùng nhập năm riêng
    if (!(`${prefix}Year` in input)) {
      if (r.solar) d[`${prefix}Year`] = parseISO(r.solar).year;
      else if (r.lunarYear && !merged[`${prefix}Year`]) d[`${prefix}Year`] = r.lunarYear;
    }
  };
  pair('birth');
  pair('death');

  const hasDeath = DEATH_FIELDS.some((k) => k !== 'deathLunarLeap' && d[k]);
  if (hasDeath) d.isAlive = false;
  if (d.isAlive === true) for (const k of DEATH_FIELDS) d[k] = k === 'deathLunarLeap' ? false : null;
  return d;
}

function toColumns(data) {
  const cols = [];
  const vals = [];
  for (const [k, v] of Object.entries(data)) {
    if (!COLUMN[k] || v === undefined) continue;
    cols.push(COLUMN[k]);
    vals.push(v);
  }
  return { cols, vals };
}

export async function audit(e, userId, action, entity, entityId, before, after) {
  await e.q(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, before_data, after_data) VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId ?? null, action, entity, entityId ?? null, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
  );
}

// ---------------------------------------------------------------------------
//  Truy vấn
// ---------------------------------------------------------------------------
const TREE_COLUMNS = `
  p.id, p.full_name, p.courtesy_name, p.pen_name, p.common_name, p.gender, p.birth_order,
  p.birth_date, p.birth_year, p.is_alive, p.death_date, p.death_year,
  p.death_lunar_day, p.death_lunar_month, p.death_lunar_year, p.death_lunar_leap,
  p.generation, p.is_lineage, p.lineage_parent_id, p.avatar_url`;

/**
 * Lấy cây (hoặc 1 nhánh) trong 3 truy vấn phẳng – không đệ quy.
 * rootId: gốc nhánh; depth: số đời tối đa tính từ gốc.
 */
export async function getTree(e, { rootId = null, depth = null } = {}) {
  let rootPath = null;
  if (rootId) {
    const r = await e.one(`SELECT path::text FROM members WHERE id = $1 AND path IS NOT NULL`, [rootId]);
    if (!r) throw new HttpError(404, 'Không tìm thấy gốc nhánh');
    rootPath = r.path;
  }
  const { members, marriages } = await loadGraph(
    e,
    `lineage AS (
       SELECT id FROM members
        WHERE path IS NOT NULL
          AND ($1::ltree IS NULL OR path <@ $1::ltree)
          AND ($2::int IS NULL OR nlevel(path) <= coalesce(nlevel($1::ltree), 0) + $2::int)
     ),
     mar AS (
       SELECT g.* FROM marriages g
        WHERE g.husband_id IN (SELECT id FROM lineage) OR g.wife_id IN (SELECT id FROM lineage)
     ),
     ids AS (
       SELECT id FROM lineage UNION SELECT husband_id FROM mar UNION SELECT wife_id FROM mar
     )`,
    [rootPath, depth],
  );
  return { rootId, members, marriages };
}

/**
 * Tải tập thành viên (kèm cha/mẹ, loại liên kết dòng tộc, chi) + các cuộc hôn nhân giữa họ.
 * idsCte phải định nghĩa CTE tên `ids(id)`.
 */
export async function loadGraph(e, idsCte, params) {
  const members = await e.q(
    `WITH ${idsCte}
     SELECT ${TREE_COLUMNS},
            f.parent_id AS father_id, mo.parent_id AS mother_id,
            lk.relation_type AS lineage_link_type,
            br.branch_id
       FROM ids JOIN members p ON p.id = ids.id
       LEFT JOIN LATERAL (SELECT parent_id FROM parent_child
                           WHERE child_id = p.id AND parent_role = 'father'
                           ORDER BY (parent_id = p.lineage_parent_id) DESC, (relation_type = 'biological') DESC LIMIT 1) f ON TRUE
       LEFT JOIN LATERAL (SELECT parent_id FROM parent_child
                           WHERE child_id = p.id AND parent_role = 'mother'
                           ORDER BY (parent_id = p.lineage_parent_id) DESC, (relation_type = 'biological') DESC LIMIT 1) mo ON TRUE
       LEFT JOIN parent_child lk ON lk.child_id = p.id AND lk.parent_id = p.lineage_parent_id
       LEFT JOIN v_member_branch br ON br.member_id = p.id
      ORDER BY p.path NULLS LAST, p.id`,
    params,
  );
  const ids = members.map((m) => m.id);
  const marriages = ids.length
    ? await e.q(
        `SELECT id, husband_id, wife_id, wife_rank, marriage_order, status, start_year, end_date
           FROM marriages WHERE husband_id = ANY($1) AND wife_id = ANY($1)
          ORDER BY husband_id, marriage_order, wife_rank`,
        [ids],
      )
    : [];
  return { members, marriages };
}

/** Tải tối thiểu dữ liệu cần để tính xưng hô: 2 người, vợ/chồng của họ và toàn bộ tổ tiên. */
export function loadKinshipGraph(e, aId, bId) {
  return loadGraph(
    e,
    `base AS (SELECT unnest($1::bigint[]) AS id),
     sp AS (SELECT CASE WHEN g.husband_id = b.id THEN g.wife_id ELSE g.husband_id END AS id
              FROM marriages g JOIN base b ON b.id IN (g.husband_id, g.wife_id)),
     seed AS (SELECT id FROM base UNION SELECT id FROM sp),
     anc AS (SELECT a.id FROM members s JOIN members a ON a.path @> s.path
              WHERE s.id IN (SELECT id FROM seed) AND s.path IS NOT NULL),
     ids AS (SELECT id FROM seed UNION SELECT id FROM anc)`,
    [[aId, bId]],
  );
}

export async function getMemberRow(e, id) {
  const m = await e.one(`SELECT m.*, m.path::text AS path FROM members m WHERE m.id = $1`, [id]);
  if (!m) throw new HttpError(404, 'Không tìm thấy thành viên');
  return m;
}

const BRIEF = `m.id, m.full_name, m.gender, m.is_alive, m.generation, m.birth_year, m.death_year, m.birth_order, m.is_lineage, m.avatar_url`;

/** Chi tiết 1 thành viên: cha mẹ, vợ/chồng, con (nhóm theo cuộc hôn nhân), anh chị em, chi/nhánh. */
export async function getMemberDetail(e, id) {
  const member = await getMemberRow(e, id);
  const [parents, spouses, children, siblings, branch, ancestors] = await Promise.all([
    e.q(
      `SELECT ${BRIEF}, pc.parent_role, pc.relation_type
         FROM parent_child pc JOIN members m ON m.id = pc.parent_id
        WHERE pc.child_id = $1 ORDER BY pc.parent_role`,
      [id],
    ),
    e.q(
      `SELECT ${BRIEF}, g.id AS marriage_id, g.wife_rank, g.marriage_order, g.status AS marriage_status,
              g.start_year, g.start_date, g.end_date, g.note AS marriage_note
         FROM marriages g JOIN members m ON m.id = CASE WHEN g.husband_id = $1 THEN g.wife_id ELSE g.husband_id END
        WHERE $1 IN (g.husband_id, g.wife_id)
        ORDER BY g.marriage_order, g.wife_rank`,
      [id],
    ),
    e.q(
      `SELECT ${BRIEF}, pc.relation_type, pc.marriage_id,
              other.id AS other_parent_id, other.full_name AS other_parent_name
         FROM parent_child pc
         JOIN members m ON m.id = pc.child_id
         LEFT JOIN parent_child opc ON opc.child_id = pc.child_id AND opc.parent_id <> pc.parent_id
         LEFT JOIN members other ON other.id = opc.parent_id
        WHERE pc.parent_id = $1
        ORDER BY m.birth_order NULLS LAST, m.birth_date NULLS LAST, m.birth_year NULLS LAST, m.id`,
      [id],
    ),
    member.lineageParentId
      ? e.q(
          `SELECT ${BRIEF} FROM members m WHERE m.lineage_parent_id = $1 AND m.id <> $2
            ORDER BY m.birth_order NULLS LAST, m.birth_date NULLS LAST, m.id`,
          [member.lineageParentId, id],
        )
      : [],
    e.one(`SELECT branch_id, branch_name FROM v_member_branch WHERE member_id = $1`, [id]),
    member.path
      ? e.q(`SELECT ${BRIEF} FROM members m WHERE m.path @> $1::ltree AND m.id <> $2 ORDER BY nlevel(m.path)`, [member.path, id])
      : [],
  ]);
  return { ...member, parents, spouses, children, siblings, ancestors, branch };
}

// ---------------------------------------------------------------------------
//  Ghi dữ liệu
// ---------------------------------------------------------------------------
export async function createMember(e, data, userId, extra = {}) {
  const norm = normalizeDates(data);
  const { cols, vals } = toColumns({ ...norm, ...extra });
  cols.push('created_by', 'updated_by');
  vals.push(userId ?? null, userId ?? null);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
  const row = await e.one(`INSERT INTO members (${cols.join(',')}) VALUES (${placeholders}) RETURNING id`, vals);
  const created = await getMemberRow(e, row.id);
  await audit(e, userId, 'member.create', 'member', row.id, null, created);
  return created;
}

export async function updateMember(e, id, data, userId) {
  const before = await getMemberRow(e, id);
  if ('generation' in data && before.lineageParentId) delete data.generation; // đời của con cháu do trigger tính
  if (data.lineageParentId === id) throw new HttpError(400, 'Không thể tự làm cha/mẹ của chính mình');
  const norm = normalizeDates(data, before);
  const { cols, vals } = toColumns(norm);
  if (!cols.length) return before;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  vals.push(userId ?? null, id);
  await e.q(`UPDATE members SET ${sets.join(', ')}, updated_by = $${vals.length - 1} WHERE id = $${vals.length}`, vals);
  const after = await getMemberRow(e, id);
  await audit(e, userId, 'member.update', 'member', id, before, after);
  return after;
}

export async function deleteMember(e, id, userId) {
  const before = await getMemberRow(e, id);
  const { count } = await e.one(`SELECT count(*)::int AS count FROM members WHERE lineage_parent_id = $1`, [id]);
  if (count > 0) throw new HttpError(409, `Không thể xóa: người này còn ${count} con cháu trên cây. Hãy xóa hoặc chuyển nhánh con cháu trước.`);
  const isFounder = await e.one(`SELECT id FROM branches WHERE founder_id = $1`, [id]);
  if (isFounder) throw new HttpError(409, 'Không thể xóa người khởi chi. Hãy xóa/đổi chi trước.');
  await e.q(`UPDATE users SET member_id = NULL WHERE member_id = $1`, [id]);
  await e.q(`DELETE FROM members WHERE id = $1`, [id]);
  await audit(e, userId, 'member.delete', 'member', id, before, null);
}

async function findMarriage(e, a, b) {
  return e.one(`SELECT * FROM marriages WHERE (husband_id = $1 AND wife_id = $2) OR (husband_id = $2 AND wife_id = $1)`, [a, b]);
}

export async function linkParent(e, { parentId, childId, relationType = 'biological', otherParentId = null }) {
  const parent = await getMemberRow(e, parentId);
  const marriage = otherParentId ? await findMarriage(e, parentId, otherParentId) : null;
  await e.q(
    `INSERT INTO parent_child (parent_id, child_id, parent_role, relation_type, marriage_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (parent_id, child_id) DO UPDATE SET relation_type = EXCLUDED.relation_type, marriage_id = EXCLUDED.marriage_id`,
    [parentId, childId, parent.gender === 'male' ? 'father' : 'mother', relationType, marriage?.id ?? null],
  );
}

/** Thêm con: tạo thành viên mới, gắn vào cây theo cha/mẹ thuộc dòng tộc, tạo quan hệ với cả cha và mẹ. */
export async function addChild(e, parentId, { member, otherParentId, relationType }, userId) {
  const parent = await getMemberRow(e, parentId);
  const other = otherParentId ? await getMemberRow(e, otherParentId) : null;
  if (other && other.gender === parent.gender) throw new HttpError(400, 'Cha và mẹ phải khác giới');
  if (other && !(await findMarriage(e, parentId, otherParentId)))
    throw new HttpError(400, 'Hai người chưa có quan hệ hôn nhân – hãy thêm vợ/chồng trước');

  // Ưu tiên cha trong họ làm cha dòng tộc (phụ hệ); nếu chỉ mẹ trong họ thì ghi theo mẹ (bên ngoại)
  const lineageCandidates = [parent, other].filter((p) => p?.isLineage);
  const lineageParent = lineageCandidates.find((p) => p.gender === 'male') ?? lineageCandidates[0];
  if (!lineageParent) throw new HttpError(400, 'Ít nhất một trong cha/mẹ phải thuộc dòng tộc');

  if (member.birthOrder == null) {
    const r = await e.one(`SELECT coalesce(max(birth_order), 0) + 1 AS next FROM members WHERE lineage_parent_id = $1`, [lineageParent.id]);
    member = { ...member, birthOrder: r.next };
  }
  const child = await createMember(e, member, userId, { isLineage: true, lineageParentId: lineageParent.id });
  await linkParent(e, { parentId, childId: child.id, relationType, otherParentId });
  if (other) await linkParent(e, { parentId: other.id, childId: child.id, relationType, otherParentId: parentId });
  return getMemberRow(e, child.id);
}

/** Thêm vợ/chồng (người mới hoặc người đã có trong hệ thống). */
export async function addSpouse(e, memberId, { member, existingMemberId, marriage = {} }, userId) {
  const self = await getMemberRow(e, memberId);
  let spouse;
  if (existingMemberId) spouse = await getMemberRow(e, existingMemberId);
  else spouse = await createMember(e, member, userId, { isLineage: false, generation: self.generation });
  if (spouse.gender === self.gender) throw new HttpError(400, 'Vợ chồng phải khác giới');

  const husbandId = self.gender === 'male' ? self.id : spouse.id;
  const wifeId = self.gender === 'female' ? self.id : spouse.id;
  if (marriage.marriageOrder == null || marriage.wifeRank == null) {
    const r = await e.one(
      `SELECT coalesce(max(marriage_order),0)+1 AS next_order, count(*) FILTER (WHERE status = 'married')::int AS active
         FROM marriages WHERE husband_id = $1`,
      [husbandId],
    );
    marriage.marriageOrder ??= r.nextOrder;
    marriage.wifeRank ??= r.active + 1; // đang có vợ -> vợ hai; tái hôn sau khi góa -> vẫn là vợ cả (vợ kế)
  }
  const mar = await e.one(
    `INSERT INTO marriages (husband_id, wife_id, wife_rank, marriage_order, status, start_date, start_year, end_date, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [husbandId, wifeId, marriage.wifeRank, marriage.marriageOrder, marriage.status ?? 'married',
     marriage.startDate ?? null, marriage.startYear ?? null, marriage.endDate ?? null, marriage.note ?? null],
  );
  await audit(e, userId, 'marriage.create', 'marriage', mar.id, null, mar);
  return { spouse, marriage: mar };
}
