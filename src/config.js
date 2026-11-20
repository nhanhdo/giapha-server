const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT || 4100),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/giapha',
  // 'require' khi kết nối Postgres qua mạng công cộng (vd DATABASE_PUBLIC_URL của Railway)
  dbSsl: process.env.PGSSLMODE === 'require',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  readAccess: process.env.READ_ACCESS || 'members', // 'public' = ai cũng xem được
  // Danh sách origin, phân cách bằng dấu phẩy. Hỗ trợ wildcard: https://giapha-*.vercel.app
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  clanName: process.env.CLAN_NAME || 'Họ Đỗ',
};

if (!process.env.JWT_SECRET) {
  if (isProd) {
    console.error('[config] Thiếu JWT_SECRET – bắt buộc khi NODE_ENV=production.');
    process.exit(1);
  }
  console.warn('[config] JWT_SECRET chưa được đặt – đang dùng khóa mặc định (chỉ dùng cho dev).');
}

// Production không được âm thầm rơi về localhost khi thiếu DATABASE_URL
if (isProd && !process.env.DATABASE_URL) {
  console.error('[config] Thiếu DATABASE_URL. Trên Railway: service backend → Variables → thêm DATABASE_URL = ${{Postgres.DATABASE_URL}}');
  process.exit(1);
}

const toRegex = (pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`, 'i');
const originMatchers = config.corsOrigins.map(toRegex);

/** Kiểm tra origin của trình duyệt có được phép gọi API không */
export const isAllowedOrigin = (origin) => !origin || originMatchers.some((re) => re.test(origin));
