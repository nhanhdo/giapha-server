# 🏯 Gia Phả Dòng Tộc – Backend (API)

Express API cho ứng dụng gia phả theo văn hóa Việt Nam, dùng **Node.js 22 + PostgreSQL (ltree)**.
Frontend nằm ở repo riêng (`giapha-frontend`).

```
├── database/schema.sql   # Schema PostgreSQL: bảng, trigger, view, function
├── src/
│   ├── shared/           # lunar.js (lịch Âm, ngày giỗ), kinship.js (xưng hô) – BẢN GỐC, frontend giữ bản sao
│   ├── routes/           # auth, members, relationships, branches, suggestions, features, users
│   ├── services/         # memberService (truy vấn cây, ghi dữ liệu), scopeService (phạm vi nhánh)
│   ├── middleware/       # JWT + phân quyền
│   └── db/               # pool, migrate, seed + dữ liệu mẫu 6 đời
├── test/                 # node:test cho thuật toán lịch Âm và xưng hô
└── railway.json          # cấu hình deploy Railway
```

## Chạy ở máy local

```bash
# PostgreSQL ≥ 13 với các extension contrib: ltree, pg_trgm, unaccent, citext
createdb giapha
cp .env.example .env          # sửa DATABASE_URL, JWT_SECRET
npm install
npm run db:seed               # áp schema + nạp dữ liệu mẫu (thêm "-- --reset" để nạp lại từ đầu)
npm run dev                   # http://localhost:4100
npm test                      # test thuật toán lịch Âm và xưng hô
```

Tài khoản mẫu: `tocTruong / Admin@123` (Tộc trưởng) · `thuKy / ThuKy@123` (Thư ký) · `thanhVien / Member@123` (Thành viên, thuộc Nhánh Giáp Nhị).

## Deploy lên Railway

1. **New Project → Deploy from GitHub repo**, chọn repo backend (để trống Root Directory). File [railway.json](railway.json) đã cấu hình sẵn:
   - pre-deploy: `npm run db:migrate` (áp schema, chạy lại nhiều lần vẫn an toàn)
   - **Ngoài ra server tự tạo bảng mỗi lần khởi động**, nên dù bước pre-deploy không chạy, database trống vẫn được tạo đủ bảng và tài khoản Tộc trưởng (`ADMIN_USERNAME` / `ADMIN_PASSWORD`). Đặt `AUTO_MIGRATE=false` nếu chỉ muốn chạy migrate thủ công.
   - Nếu repo chứa nhiều thư mục và anh/chị đặt *Root Directory* = `server`, Railway **không** tự tìm `server/railway.json`. Phải khai báo *Settings → Config-as-code → Railway Config File* = `/server/railway.json`.
   - Thiếu `DATABASE_URL` hoặc trỏ sai Postgres: server dừng ngay với thông báo chỉ cách sửa (xem tab **Deploy Logs**).
   - start: `npm start`
   - health check: `/api/health`
2. **+ New → Database → PostgreSQL**. Image Postgres của Railway đã có sẵn các extension `ltree`, `pg_trgm`, `unaccent`, `citext`.
3. Trong tab **Variables** của service backend, thêm:

   | Biến | Giá trị |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (tham chiếu tới DB qua mạng nội bộ, không cần SSL) |
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | chuỗi ngẫu nhiên dài, vd lấy từ `openssl rand -hex 32` (**bắt buộc**: thiếu thì server không khởi động) |
   | `CORS_ORIGIN` | `https://<ten-app>.vercel.app,https://<ten-app>-*.vercel.app` (mục thứ hai cho các bản preview) |
   | `CLAN_NAME` | `Họ Đỗ` |
   | `READ_ACCESS` | mặc định `members` (bắt đăng nhập); `public` nếu muốn ai cũng xem được |
   | `ADMIN_USERNAME`, `ADMIN_PASSWORD` | tài khoản Tộc trưởng đầu tiên, chỉ được tạo khi chưa có admin nào |
   | `SEED_DEMO` | `true` chỉ khi muốn nạp dữ liệu mẫu; tắt khi dùng dữ liệu thật |

4. **Settings → Networking → Generate Domain** để lấy URL dạng `https://giapha-api.up.railway.app`. Đặt URL này làm `VITE_API_URL` bên frontend.

> Nếu bật `SEED_DEMO`, CSDL sẽ có các tài khoản mẫu với mật khẩu công khai ở trên. Hãy đổi mật khẩu hoặc xóa các tài khoản đó trước khi đưa người dùng thật vào.

**Kiểm tra sau khi deploy**

- Log khởi động phải có `(production)` và dòng `CORS cho phép: https://<app>.vercel.app…`. Nếu log cảnh báo `CORS_ORIGIN vẫn là localhost`, frontend sẽ bị chặn.
- Mở `https://<backend>.up.railway.app/api/health` → `{"ok":true,"clanName":"Họ Đỗ",…}`.

**Bảo vệ đã có sẵn khi chạy production**

- Server từ chối khởi động nếu thiếu `JWT_SECRET`.
- Đăng nhập sai 5 lần (cùng IP + tài khoản) hoặc 20 lần (cùng IP) trong 15 phút → tạm khóa, trả HTTP 429. Bộ đếm nằm trong bộ nhớ, đủ cho 1 instance; nếu chạy nhiều instance cần chuyển sang Redis.
- Header bảo mật (`nosniff`, `X-Frame-Options`, `HSTS`), không lộ `X-Powered-By`.
- Tắt êm khi redeploy (`SIGTERM`): chờ request đang chạy xong rồi mới đóng kết nối DB.

Nạp dữ liệu từ máy local vào DB trên Railway (tùy chọn):

```bash
# Lấy DATABASE_PUBLIC_URL trong tab Variables của service Postgres
DATABASE_URL="<DATABASE_PUBLIC_URL>" PGSSLMODE=require npm run db:seed
```

## Thư mục `src/shared` dùng chung với frontend

`lunar.js` và `kinship.js` chạy ở cả hai phía: server dùng để tính ngày giỗ và xưng hô cho API, frontend dùng để tính ngay trên trình duyệt. **Bản gốc ở repo này.** Khi sửa, hãy chép sang `client/src/shared` của repo frontend (trên Windows có thể chạy `sync-shared.bat` ở thư mục chứa cả hai repo), và chạy `npm test` trước.

---

## 1. Thiết kế CSDL

### Ý tưởng chính để truy vấn cả cây nhanh

| Vấn đề | Giải pháp |
|---|---|
| Lấy toàn bộ cây hoặc một nhánh | Cột `members.path` kiểu **ltree** (materialized path, vd `1.4.15.26`), có index GiST. `WHERE path <@ '1.4'` lấy cả nhánh trong một lần quét index, **không cần CTE đệ quy**. |
| Giữ `path` luôn đúng | **Trigger** tự tính `path` và `generation` (đời) khi thêm người hoặc chuyển nhánh; khi chuyển nhánh sẽ cập nhật dây chuyền toàn bộ hậu duệ, kể cả đời của dâu/rể. Trigger chặn quan hệ vòng lặp. |
| Tổ tiên chung gần nhất (LCA) | Hàm `lca()` có sẵn trong ltree (bọc trong `member_lca(a, b)`). |
| Quan hệ phức tạp (nhiều vợ, tái hôn, con nuôi) | Hai bảng chuẩn hóa `parent_child` và `marriages` là nguồn dữ liệu gốc; `lineage_parent_id` là "cha/mẹ dòng tộc" quyết định vị trí trên cây phụ hệ. |
| Chi/nhánh | `branches.founder_id` (người khởi chi). Người thuộc chi nào được **suy ra từ path** (view `v_member_branch`), không lưu trùng nên không bao giờ lệch. |
| Tìm tên không dấu | Index GIN trigram trên `f_unaccent(full_name)`: gõ "do dinh tuan" vẫn ra "Đỗ Đình Tuấn". |
| Ngày Âm/Dương | Lưu cả hai: `*_date` (Dương) và `*_lunar_day/month/year/leap` (Âm), vì tổ tiên xưa thường chỉ ghi ngày Âm. API tự quy đổi phần còn thiếu. |

### Các bảng

- **members**: họ tên, tên tự, tên hiệu, tên thụy, tên thường gọi, giới tính, con thứ (`birth_order`, dùng để xác định vai anh/em), ngày sinh và ngày mất (Dương + Âm + tháng nhuận), `is_alive`, `generation`, `is_lineage` (người trong họ hay dâu/rể), `lineage_parent_id`, `path`, quê quán, nơi an táng, tiểu sử…
- **marriages**: `husband_id`, `wife_id`, `wife_rank` (1 = vợ cả, 2 = vợ hai…), `marriage_order` (lần kết hôn thứ mấy, dùng cho tái hôn/vợ kế), `status` (married/divorced/widowed/separated).
- **parent_child**: `parent_role` (father/mother), `relation_type` (biological = ruột / adopted = nuôi / step = con riêng), `marriage_id` (con của bà cả hay bà hai). Mỗi người có tối đa một cha ruột và một mẹ ruột (unique index).
- **branches**: chi/nhánh lồng nhau, mỗi chi có một người khởi chi.
- **users**: `role` gồm admin (Tộc trưởng) / secretary (Thư ký) / member (Thành viên), `member_id` liên kết với người trên cây, `calendar_token` cho link lịch giỗ.
- **edit_suggestions**: đề xuất chỉnh sửa (payload JSONB), trạng thái pending/approved/rejected.
- **audit_logs**: lưu dữ liệu trước và sau mỗi thay đổi.

## 2. Phân quyền (RBAC)

| Quyền | Tộc trưởng | Thư ký | Thành viên |
|---|:-:|:-:|:-:|
| Xem cây (mặc định phải đăng nhập; đặt `READ_ACCESS=public` để công khai) | ✓ | ✓ | ✓ |
| Thêm/sửa/xóa thành viên và quan hệ | ✓ | ✓ | – |
| Duyệt đề xuất | ✓ | ✓ | – |
| Gửi đề xuất | ✓ | ✓ | ✓ *trong nhánh của mình* |
| Quản lý tài khoản | ✓ | – | – |

"Nhánh của mình" là cây con của người khởi chi gần nhất phía trên thành viên đó (nếu không thuộc chi nào thì lấy ông nội), cộng thêm dâu/rể trong cây con đó.

## 3. API

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | Đăng nhập, trả JWT |
| GET | `/api/auth/me` | Thông tin tài khoản và danh sách quyền |
| PATCH | `/api/auth/password` | Tự đổi mật khẩu `{currentPassword, newPassword}` |
| GET | `/api/tree?rootId=&depth=` | Cả cây hoặc một nhánh, dạng phẳng `{members, marriages}` |
| GET | `/api/members?q=&generation=&branchId=&isAlive=` | Tìm kiếm (không dấu, gần đúng) |
| GET | `/api/members/:id` | Chi tiết: cha mẹ, vợ/chồng, con (nhóm theo mẹ), anh chị em, tổ tiên, chi |
| POST | `/api/members` | Thêm người gốc (thủy tổ) |
| PATCH | `/api/members/:id` | Sửa thông tin (tự quy đổi Âm/Dương; đổi `lineageParentId` để chuyển nhánh) |
| DELETE | `/api/members/:id` | Xóa (bị chặn nếu còn con cháu hoặc là người khởi chi) |
| POST | `/api/members/:id/children` | Thêm con `{member, otherParentId, relationType}` |
| POST | `/api/members/:id/spouses` | Thêm vợ/chồng `{member \| existingMemberId, marriage}`; nếu không truyền, thứ bậc vợ được tính tự động |
| POST/DELETE | `/api/relationships/parent-child` | Nối hoặc gỡ cha/mẹ nuôi, cha/mẹ kế, chuyển nhánh |
| PATCH/DELETE | `/api/relationships/marriages/:id` | Đổi vợ cả/vợ lẽ, ly hôn, góa… |
| GET/POST/PATCH/DELETE | `/api/branches` | Chi/nhánh |
| POST | `/api/suggestions` | Gửi đề xuất (`update_member`, `add_child`, `add_spouse`, `other`) |
| GET | `/api/suggestions?status=` | Người duyệt thấy tất cả, thành viên thấy đề xuất của mình |
| POST | `/api/suggestions/:id/approve` · `/reject` | Duyệt (áp dụng trong một transaction) hoặc từ chối |
| GET | `/api/memorials/upcoming?days=30` | Ngày giỗ sắp tới, đã quy đổi sang Dương lịch |
| GET | `/api/memorials/calendar.ics?token=` | Lịch iCalendar để đăng ký trên Google Calendar/iPhone (nhắc trước 7 ngày và 1 ngày) |
| GET | `/api/kinship?a=&b=` | Tính xưng hô giữa hai người |
| GET | `/api/lunar/convert?solar=` hoặc `?lunarDay=&lunarMonth=&lunarYear=&leap=` | Quy đổi lịch |
| GET/POST/PATCH | `/api/users` | Quản lý tài khoản (chỉ Tộc trưởng) |

## 4. Thuật toán

- **Ngày giỗ** (`src/shared/lunar.js`): ngày mất Âm lịch được quy đổi sang Dương lịch của năm nay hoặc năm sau. Áp dụng tục lệ: mất vào tháng nhuận thì cúng tháng chính; tháng thiếu (29 ngày) thì cúng ngày 29. Có nhãn Giỗ đầu (Tiểu tường), Giỗ hết (Đại tường), Cát kỵ.
- **Xưng hô** (`src/shared/kinship.js`): đi ngược chuỗi tổ tiên để tìm LCA. **Vai vế xét theo nhánh** (con nhà bác là anh/chị dù ít tuổi hơn, đúng nguyên tắc "con chú con bác"). Hỗ trợ: cha mẹ, ông bà nội/ngoại, cụ/kỵ (Bắc) hoặc ông cố/ông sơ (Trung/Nam), bác/chú/cô (miền Trung gọi là O)/cậu/dì, thím/mợ/dượng, ông chú/bà cô, anh chị em họ, cùng cha khác mẹ, con nuôi, dâu/rể (gọi theo vai của chồng/vợ), vợ cả/vợ lẽ.

## Ghi chú

- Lịch Âm dùng được cho năm 1800–2199, tính theo múi giờ GMT+7.
- Từ xưng hô khác nhau giữa các địa phương và gia đình. Bảng từ vựng nằm ở đầu `src/shared/kinship.js` để dễ chỉnh sửa.
- Với cây rất lớn (hàng chục nghìn người), nên tải theo nhánh (`/api/tree?rootId=&depth=`) thay vì tải cả cây.
