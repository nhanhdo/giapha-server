/**
 * Phạm vi "nhánh của mình" cho Thành viên khi gửi đề xuất:
 *   gốc phạm vi = người khởi chi/nhánh gần nhất của thành viên đó;
 *   nếu không thuộc chi nào -> ông nội của thành viên (gia đình 3 đời).
 * Được đề xuất cho: mọi người trong cây con của gốc phạm vi + dâu/rể của họ.
 */
export async function scopeRootPath(e, memberId) {
  const r = await e.one(
    `SELECT m.path::text AS path,
            (SELECT f.path::text FROM branches b JOIN members f ON f.id = b.founder_id
              WHERE m.path <@ f.path ORDER BY nlevel(f.path) DESC LIMIT 1) AS branch_path
       FROM members m WHERE m.id = $1`,
    [memberId],
  );
  if (!r?.path) {
    // Tài khoản liên kết với dâu/rể -> dùng path của người phối ngẫu
    const s = await e.one(
      `SELECT p.id FROM marriages g JOIN members p ON p.id = CASE WHEN g.husband_id = $1 THEN g.wife_id ELSE g.husband_id END
        WHERE $1 IN (g.husband_id, g.wife_id) AND p.path IS NOT NULL LIMIT 1`,
      [memberId],
    );
    return s ? scopeRootPath(e, s.id) : null;
  }
  if (r.branchPath) return r.branchPath;
  const labels = r.path.split('.');
  return labels.slice(0, Math.max(1, labels.length - 2)).join('.');
}

export async function isInUserScope(e, user, targetMemberId) {
  if (['admin', 'secretary'].includes(user.role)) return true;
  if (!user.memberId) return false;
  const root = await scopeRootPath(e, user.memberId);
  if (!root) return false;
  const r = await e.one(
    `SELECT EXISTS (
       SELECT 1 FROM members t WHERE t.id = $1 AND t.path <@ $2::ltree
       UNION ALL
       SELECT 1 FROM marriages g JOIN members p ON p.id IN (g.husband_id, g.wife_id)
        WHERE $1 IN (g.husband_id, g.wife_id) AND p.id <> $1 AND p.path <@ $2::ltree
     ) AS ok`,
    [targetMemberId, root],
  );
  return r.ok;
}
