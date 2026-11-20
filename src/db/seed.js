/**
 * npm run db:seed            – áp dụng schema + nạp dữ liệu mẫu (chỉ khi DB còn trống)
 * npm run db:seed -- --reset – XÓA TOÀN BỘ bảng của ứng dụng rồi nạp lại
 */
import bcrypt from 'bcryptjs';
import { pool, tx } from './pool.js';
import { migrate } from './migrate.js';
import { people, branches, users } from './seedData.js';
import { createMember } from '../services/memberService.js';

const RESET_SQL = `
  DROP TABLE IF EXISTS audit_logs, edit_suggestions, users, branches, parent_child, marriages, members CASCADE;
  DROP VIEW IF EXISTS v_member_branch;
  DROP TYPE IF EXISTS gender_t, user_role_t, parent_role_t, child_relation_t, marriage_status_t, suggestion_type_t, suggestion_status_t CASCADE;`;

async function main() {
  if (process.argv.includes('--reset')) {
    await pool.query(RESET_SQL);
    console.log('✔ Đã xóa dữ liệu cũ');
  }
  await migrate();
  await seedDemo();
}

/** Nạp dữ liệu mẫu nếu bảng members còn trống (schema phải có sẵn) */
export async function seedDemo() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM members');
  if (rows[0].n > 0) {
    console.log('ℹ DB đã có dữ liệu – bỏ qua seed (dùng --reset để nạp lại).');
    return;
  }

  await tx(async (e) => {
    const id = new Map();
    const byKey = new Map(people.map((p) => [p.key, p]));
    for (const p of people) {
      const data = {
        fullName: p.fullName, courtesyName: p.courtesyName, penName: p.penName, gender: p.gender,
        birthOrder: p.birthOrder, birthYear: p.birthYear, birthDate: p.birthDate, deathDate: p.deathDate,
        hometown: p.hometown, burialPlace: p.burialPlace, biography: p.biography, occupation: p.occupation, note: p.note,
        isAlive: !(p.death || p.deathDate),
        generation: p.generation,
      };
      if (p.death) Object.assign(data, { deathLunarDay: p.death[0], deathLunarMonth: p.death[1], deathLunarYear: p.death[2] });
      for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];

      if (p.spouseOf) {
        const partnerId = id.get(p.spouseOf);
        const partner = await e.one('SELECT generation FROM members WHERE id = $1', [partnerId]);
        const m = await createMember(e, data, null, { isLineage: false, generation: partner.generation });
        id.set(p.key, m.id);
        const [husbandId, wifeId] = p.gender === 'female' ? [partnerId, m.id] : [m.id, partnerId];
        await e.q(
          `INSERT INTO marriages (husband_id, wife_id, wife_rank, marriage_order, status) VALUES ($1,$2,$3,$4,$5)`,
          [husbandId, wifeId, p.wifeRank ?? 1, p.marriageOrder ?? 1, p.marriageStatus ?? 'married'],
        );
        continue;
      }

      const m = await createMember(e, data, null, { isLineage: true, lineageParentId: p.parent ? id.get(p.parent) : null });
      id.set(p.key, m.id);
      if (!p.parent) continue;

      const rel = p.adopted ? 'adopted' : 'biological';
      const parentKeys = [p.parent, p.father, p.mother].filter(Boolean);
      for (const pk of new Set(parentKeys)) {
        const other = parentKeys.find((k) => k !== pk);
        const mar = other
          ? await e.one(
              `SELECT id FROM marriages WHERE (husband_id = $1 AND wife_id = $2) OR (husband_id = $2 AND wife_id = $1)`,
              [id.get(pk), id.get(other)],
            )
          : null;
        await e.q(
          `INSERT INTO parent_child (parent_id, child_id, parent_role, relation_type, marriage_id) VALUES ($1,$2,$3,$4,$5)`,
          [id.get(pk), m.id, byKey.get(pk).gender === 'male' ? 'father' : 'mother', rel, mar?.id ?? null],
        );
      }
    }

    const branchId = new Map();
    for (const b of branches) {
      const row = await e.one(
        `INSERT INTO branches (name, founder_id, parent_id, description) VALUES ($1,$2,$3,$4) RETURNING id`,
        [b.name, id.get(b.founder), b.parent ? branchId.get(b.parent) : null, b.description ?? null],
      );
      branchId.set(b.key, row.id);
    }

    for (const u of users) {
      await e.q(`INSERT INTO users (username, password_hash, display_name, role, member_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (username) DO NOTHING`, [
        u.username, await bcrypt.hash(u.password, 10), u.displayName, u.role, id.get(u.member),
      ]);
    }
    console.log(`✔ Đã nạp ${people.length} thành viên, ${branches.length} chi/nhánh, ${users.length} tài khoản`);
    console.table(users.map(({ username, password, role }) => ({ username, password, role })));
  });
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('src/db/seed.js')) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
