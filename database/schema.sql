-- =====================================================================
--  GIA PHẢ GIA TỘC – PostgreSQL schema (PostgreSQL ≥ 12)
--
--  Ý tưởng tối ưu truy vấn cây:
--   * Bảng parent_child + marriages là NGUỒN SỰ THẬT của mọi quan hệ
--     (cha/mẹ – con ruột/nuôi/riêng, vợ – chồng nhiều lần, vợ cả/vợ lẽ).
--   * members.lineage_parent_id = "cha/mẹ dòng tộc" (thường là cha) – xác định
--     vị trí của người đó trên cây gia phả (cây phụ hệ, mỗi người 1 cha dòng tộc).
--   * members.path (ltree, Materialized Path) do TRIGGER tự duy trì, vd '1.4.17.52'
--       - Lấy toàn bộ cây           : WHERE path IS NOT NULL ORDER BY path        (1 lần quét)
--       - Lấy 1 chi/nhánh           : WHERE path <@ '1.4'                          (GiST index)
--       - Tổ tiên của 1 người       : WHERE path @> '1.4.17.52'
--       - Tổ tiên chung gần nhất    : lca(path_a, path_b)                          (hàm có sẵn của ltree)
--     => Không cần recursive CTE cho các truy vấn đọc.
--   * Chi/nhánh (branches) xác định bằng "người khởi chi" (founder) – thành viên
--     thuộc chi nào được suy ra từ path, không lưu trùng lặp nên luôn nhất quán.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid() cho PostgreSQL 12 (từ bản 13 đã có sẵn)

-- Hàm bỏ dấu IMMUTABLE để đánh index tìm kiếm tên không dấu ("do dinh" ~ "Đỗ Đình")
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, $1)) $$;

-- ---------------------------------------------------------------------
--  Kiểu dữ liệu liệt kê
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE gender_t           AS ENUM ('male', 'female');
  CREATE TYPE user_role_t        AS ENUM ('admin', 'secretary', 'member');   -- Tộc trưởng | Thư ký | Thành viên
  CREATE TYPE parent_role_t      AS ENUM ('father', 'mother');
  CREATE TYPE child_relation_t   AS ENUM ('biological', 'adopted', 'step');  -- con ruột | con nuôi | con riêng của vợ/chồng
  CREATE TYPE marriage_status_t  AS ENUM ('married', 'divorced', 'widowed', 'separated');
  CREATE TYPE suggestion_type_t  AS ENUM ('update_member', 'add_child', 'add_spouse', 'other');
  CREATE TYPE suggestion_status_t AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
--  THÀNH VIÊN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id                 BIGSERIAL PRIMARY KEY,
  full_name          TEXT        NOT NULL,                 -- Họ và tên (tên húy)
  courtesy_name      TEXT,                                 -- Tên tự
  pen_name           TEXT,                                 -- Tên hiệu
  posthumous_name    TEXT,                                 -- Tên thụy / Pháp danh
  common_name        TEXT,                                 -- Tên thường gọi (Ông Cả, Bà Hai...)
  gender             gender_t    NOT NULL,
  birth_order        SMALLINT,                             -- Con thứ mấy trong nhà (quyết định vai anh/em)

  -- Ngày sinh: Dương lịch (date) + Âm lịch (tách cột, vì cụ xưa thường chỉ ghi ngày Âm)
  birth_date         DATE,
  birth_year         SMALLINT,                             -- khi chỉ biết năm
  birth_lunar_day    SMALLINT CHECK (birth_lunar_day   BETWEEN 1 AND 30),
  birth_lunar_month  SMALLINT CHECK (birth_lunar_month BETWEEN 1 AND 12),
  birth_lunar_year   SMALLINT,
  birth_lunar_leap   BOOLEAN NOT NULL DEFAULT FALSE,       -- tháng nhuận

  -- Trạng thái & ngày mất
  is_alive           BOOLEAN NOT NULL DEFAULT TRUE,
  death_date         DATE,
  death_year         SMALLINT,
  death_lunar_day    SMALLINT CHECK (death_lunar_day   BETWEEN 1 AND 30),   -- => ngày giỗ
  death_lunar_month  SMALLINT CHECK (death_lunar_month BETWEEN 1 AND 12),
  death_lunar_year   SMALLINT,
  death_lunar_leap   BOOLEAN NOT NULL DEFAULT FALSE,

  generation         SMALLINT NOT NULL DEFAULT 1 CHECK (generation >= 1),   -- Đời thứ X (trigger tự tính cho con cháu)
  is_lineage         BOOLEAN  NOT NULL DEFAULT TRUE,       -- TRUE: người trong họ (huyết thống / con nuôi); FALSE: dâu, rể
  lineage_parent_id  BIGINT REFERENCES members(id) ON DELETE RESTRICT,
  path               LTREE,                                -- Materialized path (trigger duy trì), NULL với dâu/rể

  hometown           TEXT,                                 -- Quê quán
  occupation         TEXT,                                 -- Nghề nghiệp / chức tước
  burial_place       TEXT,                                 -- Nơi an táng (mộ phần)
  biography          TEXT,                                 -- Tiểu sử, công trạng
  avatar_url         TEXT,
  note               TEXT,

  created_by         INT,
  updated_by         INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Người còn sống không có ngày mất (người đã mất có thể "không rõ ngày")
  CONSTRAINT chk_alive_no_death CHECK (NOT is_alive OR (death_date IS NULL AND death_year IS NULL AND death_lunar_day IS NULL)),
  CONSTRAINT chk_lineage_parent CHECK (lineage_parent_id IS NULL OR lineage_parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_members_path_gist   ON members USING GIST (path);
CREATE INDEX IF NOT EXISTS idx_members_path_btree  ON members (path);               -- ORDER BY path
CREATE INDEX IF NOT EXISTS idx_members_lineage_par ON members (lineage_parent_id);
CREATE INDEX IF NOT EXISTS idx_members_generation  ON members (generation);
CREATE INDEX IF NOT EXISTS idx_members_name_trgm   ON members USING GIN (f_unaccent(full_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_members_memorial    ON members (death_lunar_month, death_lunar_day) WHERE NOT is_alive;

-- ---------------------------------------------------------------------
--  HÔN NHÂN (Vợ – Chồng): nhiều vợ, tái hôn, ly hôn, vợ cả / vợ lẽ
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marriages (
  id               BIGSERIAL PRIMARY KEY,
  husband_id       BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  wife_id          BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  wife_rank        SMALLINT NOT NULL DEFAULT 1 CHECK (wife_rank >= 1),   -- 1: vợ cả (chính thất), 2: vợ hai (thứ thất)...
  marriage_order   SMALLINT NOT NULL DEFAULT 1 CHECK (marriage_order >= 1), -- lần kết hôn thứ mấy của người chồng (tái hôn / vợ kế)
  status           marriage_status_t NOT NULL DEFAULT 'married',
  start_date       DATE,
  start_year       SMALLINT,
  end_date         DATE,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_marriage UNIQUE (husband_id, wife_id),
  CONSTRAINT chk_marriage_self CHECK (husband_id <> wife_id)
);
CREATE INDEX IF NOT EXISTS idx_marriages_wife ON marriages (wife_id);

-- ---------------------------------------------------------------------
--  CHA/MẸ – CON
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_child (
  parent_id      BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  child_id       BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  parent_role    parent_role_t    NOT NULL,
  relation_type  child_relation_t NOT NULL DEFAULT 'biological',
  marriage_id    BIGINT REFERENCES marriages(id) ON DELETE SET NULL,   -- con của bà cả hay bà hai...
  note           TEXT,
  PRIMARY KEY (parent_id, child_id),
  CONSTRAINT chk_pc_self CHECK (parent_id <> child_id)
);
CREATE INDEX IF NOT EXISTS idx_pc_child ON parent_child (child_id);
-- Mỗi người chỉ có 1 cha ruột và 1 mẹ ruột
CREATE UNIQUE INDEX IF NOT EXISTS uq_pc_bio_parent ON parent_child (child_id, parent_role) WHERE relation_type = 'biological';

-- ---------------------------------------------------------------------
--  CHI / NHÁNH
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,                     -- "Chi Giáp", "Nhánh Hai"...
  parent_id    INT REFERENCES branches(id) ON DELETE SET NULL,
  founder_id   BIGINT NOT NULL UNIQUE REFERENCES members(id) ON DELETE RESTRICT,  -- Người khởi chi
  description  TEXT,
  sort_order   INT NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
--  NGƯỜI DÙNG & PHÂN QUYỀN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        CITEXT NOT NULL UNIQUE,
  password_hash   TEXT   NOT NULL,
  display_name    TEXT   NOT NULL,
  role            user_role_t NOT NULL DEFAULT 'member',
  member_id       BIGINT REFERENCES members(id) ON DELETE SET NULL,   -- liên kết tài khoản với 1 người trên cây
  calendar_token  UUID   NOT NULL DEFAULT gen_random_uuid(),          -- link lịch giỗ .ics riêng
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;

-- Đề xuất chỉnh sửa (thành viên gửi – quản trị viên duyệt)
CREATE TABLE IF NOT EXISTS edit_suggestions (
  id               BIGSERIAL PRIMARY KEY,
  type             suggestion_type_t   NOT NULL,
  target_member_id BIGINT REFERENCES members(id) ON DELETE CASCADE,
  payload          JSONB  NOT NULL,                -- { changes: {...} } | { member: {...}, relation: {...} }
  reason           TEXT,
  status           suggestion_status_t NOT NULL DEFAULT 'pending',
  proposer_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id      INT REFERENCES users(id) ON DELETE SET NULL,
  review_note      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sugg_status ON edit_suggestions (status, created_at DESC);

-- Nhật ký thay đổi
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,                 -- member.create, member.update, marriage.delete...
  entity      TEXT NOT NULL,
  entity_id   BIGINT,
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
--  TRIGGER duy trì path + generation
-- =====================================================================
CREATE OR REPLACE FUNCTION trg_members_before() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p_path ltree;
  p_gen  smallint;
BEGIN
  NEW.updated_at := now();
  -- Chỉ tính lại path khi thêm mới hoặc đổi cha dòng tộc; các cập nhật khác (kể cả cập nhật dây chuyền
  -- từ trigger AFTER) giữ nguyên path đã được gán.
  IF TG_OP = 'UPDATE'
     AND NEW.lineage_parent_id IS NOT DISTINCT FROM OLD.lineage_parent_id
     AND NEW.is_lineage = OLD.is_lineage THEN
    RETURN NEW;
  END IF;
  IF NEW.lineage_parent_id IS NULL THEN
    NEW.path := CASE WHEN NEW.is_lineage THEN text2ltree(NEW.id::text) ELSE NULL END;
  ELSE
    SELECT path, generation INTO p_path, p_gen FROM members WHERE id = NEW.lineage_parent_id;
    IF p_path IS NULL THEN
      RAISE EXCEPTION 'Cha/mẹ dòng tộc (id=%) không nằm trên cây gia phả', NEW.lineage_parent_id;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.path IS NOT NULL AND p_path <@ OLD.path THEN
      RAISE EXCEPTION 'Không thể đặt hậu duệ làm cha/mẹ (vòng lặp quan hệ)';
    END IF;
    NEW.is_lineage := TRUE;
    NEW.path       := p_path || text2ltree(NEW.id::text);
    NEW.generation := p_gen + 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS members_before_iu ON members;
CREATE TRIGGER members_before_iu
  BEFORE INSERT OR UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION trg_members_before();

-- Khi 1 người đổi vị trí (đổi cha dòng tộc) hoặc đổi đời: cập nhật toàn bộ hậu duệ + dâu/rể của họ
CREATE OR REPLACE FUNCTION trg_members_after() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  delta smallint := NEW.generation - OLD.generation;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF OLD.path IS NOT NULL AND (NEW.path IS DISTINCT FROM OLD.path OR delta <> 0) THEN
    -- Hậu duệ không đổi lineage_parent_id nên trigger BEFORE giữ nguyên path được gán ở đây
    UPDATE members d
       SET path       = NEW.path || subpath(d.path, nlevel(OLD.path)),
           generation = d.generation + delta
     WHERE d.path <@ OLD.path AND d.id <> NEW.id;
    -- Dâu/rể theo đời của người phối ngẫu
    UPDATE members s
       SET generation = s.generation + delta
     WHERE NOT s.is_lineage AND delta <> 0
       AND s.id IN (SELECT CASE WHEN g.husband_id = m.id THEN g.wife_id ELSE g.husband_id END
                      FROM marriages g JOIN members m ON m.id IN (g.husband_id, g.wife_id)
                     WHERE m.path <@ NEW.path);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS members_after_u ON members;
CREATE TRIGGER members_after_u
  AFTER UPDATE OF lineage_parent_id, generation, is_lineage ON members
  FOR EACH ROW EXECUTE FUNCTION trg_members_after();

-- Ràng buộc giới tính trong hôn nhân
CREATE OR REPLACE FUNCTION trg_marriage_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT gender FROM members WHERE id = NEW.husband_id) <> 'male'
     OR (SELECT gender FROM members WHERE id = NEW.wife_id) <> 'female' THEN
    RAISE EXCEPTION 'husband_id phải là Nam, wife_id phải là Nữ';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marriages_check ON marriages;
CREATE TRIGGER marriages_check BEFORE INSERT OR UPDATE ON marriages
  FOR EACH ROW EXECUTE FUNCTION trg_marriage_check();

-- =====================================================================
--  VIEW & FUNCTION tiện ích
-- =====================================================================

-- Chi/nhánh của từng người = chi có người khởi chi là tổ tiên gần nhất
CREATE OR REPLACE VIEW v_member_branch AS
SELECT m.id AS member_id, b.id AS branch_id, b.name AS branch_name
  FROM members m
  LEFT JOIN LATERAL (
        SELECT br.id, br.name
          FROM branches br JOIN members f ON f.id = br.founder_id
         WHERE m.path <@ f.path
         ORDER BY nlevel(f.path) DESC
         LIMIT 1) b ON TRUE
 WHERE m.path IS NOT NULL;

-- Tổ tiên chung gần nhất của 2 người trong họ
-- (lca() của ltree không tính chính nút cuối, nên xử lý riêng trường hợp tổ tiên trực hệ)
CREATE OR REPLACE FUNCTION member_lca(a BIGINT, b BIGINT) RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN ma.path @> mb.path THEN ma.id
           WHEN mb.path @> ma.path THEN mb.id
           WHEN nlevel(lca(ma.path, mb.path)) > 0 THEN ltree2text(subpath(lca(ma.path, mb.path), -1))::BIGINT
         END
    FROM members ma, members mb
   WHERE ma.id = a AND mb.id = b AND ma.path IS NOT NULL AND mb.path IS NOT NULL
$$;
