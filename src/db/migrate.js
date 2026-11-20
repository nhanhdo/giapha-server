import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

// Khóa advisory của PostgreSQL: nhiều instance khởi động cùng lúc thì chỉ 1 instance chạy migrate tại một thời điểm
const MIGRATE_LOCK_ID = 727_001;

/** Áp dụng schema (idempotent – chạy lại nhiều lần an toàn) */
export async function migrate() {
  const file = fileURLToPath(new URL('../../database/schema.sql', import.meta.url));
  await pool.query(await readFile(file, 'utf8'));
  console.log('✔ Đã áp dụng database/schema.sql');
}

/**
 * Tạo tài khoản Tộc trưởng đầu tiên từ biến môi trường ADMIN_USERNAME / ADMIN_PASSWORD
 * nếu chưa có tài khoản admin nào (dùng khi deploy với dữ liệu thật).
 */
export async function bootstrapAdmin() {
  const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = process.env;
  if (!username || !password) return;
  const { rows } = await pool.query(`SELECT 1 FROM users WHERE role = 'admin' LIMIT 1`);
  if (rows.length) return;
  if (password.length < 8) throw new Error('ADMIN_PASSWORD phải có ít nhất 8 ký tự');
  await pool.query(`INSERT INTO users (username, password_hash, display_name, role) VALUES ($1, $2, $3, 'admin')`, [
    username.trim(), await bcrypt.hash(password, 10), process.env.ADMIN_DISPLAY_NAME || 'Tộc trưởng',
  ]);
  console.log(`✔ Đã tạo tài khoản Tộc trưởng "${username.trim()}"`);
}

/** Lỗi kết nối DB -> thông điệp chỉ rõ cách sửa (thay vì stack trace khó hiểu) */
export function explainDbError(e) {
  const url = process.env.DATABASE_URL;
  if (!url) return 'Chưa có biến DATABASE_URL. Trên Railway: service backend → Variables → thêm DATABASE_URL = ${{Postgres.DATABASE_URL}}';
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'].includes(e.code))
    return `Không kết nối được database (${e.code}). Kiểm tra DATABASE_URL có trỏ đúng service Postgres không (host hiện tại: ${safeHost(url)}).`;
  if (e.code === '28P01') return 'Sai tài khoản/mật khẩu database trong DATABASE_URL.';
  if (e.code === '3D000') return 'Database trong DATABASE_URL không tồn tại.';
  if (/SSL|self.signed|certificate/i.test(e.message)) return `Lỗi SSL khi kết nối database: ${e.message}. Kết nối qua mạng nội bộ Railway thì bỏ PGSSLMODE; qua DATABASE_PUBLIC_URL thì đặt PGSSLMODE=require.`;
  return e.message;
}
const safeHost = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return 'không đọc được';
  }
};

/**
 * Chuẩn bị database: tạo bảng (nếu chưa có), nạp dữ liệu mẫu (SEED_DEMO=true), tạo Tộc trưởng đầu tiên.
 * Được gọi tự động khi server khởi động VÀ ở bước pre-deploy (npm run db:migrate).
 */
export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK_ID]);
    await migrate();
    if (process.env.SEED_DEMO === 'true') {
      const { seedDemo } = await import('./seed.js');
      await seedDemo();
    }
    await bootstrapAdmin();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATE_LOCK_ID]).catch(() => {});
    client.release();
  }
}

// Chạy trực tiếp: npm run db:migrate  (Railway gọi ở bước preDeploy)
if (process.argv[1]?.replaceAll('\\', '/').endsWith('src/db/migrate.js')) {
  runMigrations()
    .catch((e) => {
      console.error('✖ Chuẩn bị database thất bại:', explainDbError(e));
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
