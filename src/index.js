import express from 'express';
import cors from 'cors';
import { config, isAllowedOrigin } from './config.js';
import { pool } from './db/pool.js';
import { explainDbError, runMigrations } from './db/migrate.js';
import { authOptional } from './middleware/auth.js';
import { errorHandler } from './utils/http.js';
import authRoutes from './routes/auth.js';
import memberRoutes from './routes/members.js';
import relationshipRoutes from './routes/relationships.js';
import branchRoutes from './routes/branches.js';
import suggestionRoutes from './routes/suggestions.js';
import featureRoutes from './routes/features.js';
import userRoutes from './routes/users.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // chạy sau proxy của Railway -> req.ip là IP thật của người dùng

// Header bảo mật cơ bản (API chỉ trả JSON / file lịch .ics)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), credentials: false, maxAge: 600 }));
app.use(express.json({ limit: '2mb' }));
app.use(authOptional);

app.get('/api/health', (_req, res) => res.json({ ok: true, clanName: config.clanName, readAccess: config.readAccess }));
app.use('/api/auth', authRoutes);
app.use('/api', memberRoutes); //            /api/tree, /api/members/...
app.use('/api/relationships', relationshipRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/suggestions', suggestionRoutes);
app.use('/api/users', userRoutes);
app.use('/api', featureRoutes); //           /api/memorials/..., /api/kinship, /api/lunar/convert
app.use('/api', (_req, res) => res.status(404).json({ error: 'Không tìm thấy API' }));
app.use(errorHandler);

// Tự tạo bảng / cập nhật schema trước khi nhận request – không phụ thuộc bước pre-deploy của Railway
// (đặt AUTO_MIGRATE=false nếu muốn chỉ chạy migrate thủ công)
if (process.env.AUTO_MIGRATE !== 'false') {
  try {
    await runMigrations();
  } catch (e) {
    console.error('✖ Không chuẩn bị được database:', explainDbError(e));
    process.exit(1);
  }
}

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`🏯 Gia phả API chạy tại cổng ${config.port} (${config.isProd ? 'production' : 'development'})`);
  console.log(`   CORS cho phép: ${config.corsOrigins.join(', ')}`);
  if (config.isProd && config.corsOrigins.every((o) => o.includes('localhost')))
    console.warn('[config] CORS_ORIGIN vẫn là localhost – frontend trên Vercel sẽ bị chặn. Hãy đặt CORS_ORIGIN=https://<app>.vercel.app');
});

// Tắt êm khi Railway redeploy (SIGTERM): ngừng nhận request mới, chờ request đang chạy xong rồi đóng kết nối DB
let closing = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    console.log(`Nhận ${sig} – đang tắt máy chủ…`);
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // quá 10 giây thì buộc thoát
  });
}
