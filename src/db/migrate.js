import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

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
    username, await bcrypt.hash(password, 10), process.env.ADMIN_DISPLAY_NAME || 'Tộc trưởng',
  ]);
  console.log(`✔ Đã tạo tài khoản Tộc trưởng "${username}"`);
}

// Chạy trực tiếp: npm run db:migrate  (Railway gọi ở bước preDeploy)
if (process.argv[1]?.replaceAll('\\', '/').endsWith('src/db/migrate.js')) {
  (async () => {
    await migrate();
    if (process.env.SEED_DEMO === 'true') {
      const { seedDemo } = await import('./seed.js');
      await seedDemo();
    }
    await bootstrapAdmin();
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
