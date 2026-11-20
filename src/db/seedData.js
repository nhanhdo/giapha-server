/**
 * Dữ liệu mẫu: Họ Đỗ – 6 đời.
 * Minh họa: vợ cả/vợ lẽ, tái hôn (vợ kế), con nuôi, con của con gái (bên ngoại),
 * vai vế "con chú con bác" (Minh – nhánh dưới – lớn tuổi hơn Tuấn – nhánh trên).
 *
 * parent  : key của cha/mẹ dòng tộc (lineage parent)
 * father/mother: cha/mẹ (nếu khác mặc định)
 * spouseOf: dâu/rể gắn vào người trong họ
 * death   : [ngày ÂL, tháng ÂL, năm ÂL]
 */
export const people = [
  // ---- Đời 1 ----
  { key: 'N1', fullName: 'Đỗ Đình Phúc', courtesyName: 'Phúc Hậu', penName: 'Mặc Trai', gender: 'male', generation: 1,
    birthYear: 1840, death: [12, 10, 1908], hometown: 'Làng Đông Hòa, phủ Ứng Hòa', burialPlace: 'Nghĩa trang họ, xứ Đồng Cao',
    biography: 'Thủy tổ khai cơ lập nghiệp tại làng Đông Hòa. Ông đỗ Tú tài khoa Mậu Thìn, mở trường dạy chữ Nho, được dân làng kính trọng.' },
  { key: 'W1', fullName: 'Trần Thị Hiền', gender: 'female', spouseOf: 'N1', wifeRank: 1, birthYear: 1845, death: [3, 2, 1912] },
  { key: 'W2', fullName: 'Lê Thị Mai', gender: 'female', spouseOf: 'N1', wifeRank: 2, birthYear: 1855, death: [20, 10, 1925] },

  // ---- Đời 2 ----
  { key: 'N2a', fullName: 'Đỗ Đình Lộc', courtesyName: 'Hữu Lộc', gender: 'male', parent: 'N1', mother: 'W1', birthOrder: 1,
    birthYear: 1868, death: [5, 11, 1940], biography: 'Trưởng nam, khởi lập Chi Giáp. Làm Lý trưởng hai khóa.' },
  { key: 'W3', fullName: 'Nguyễn Thị Lan', gender: 'female', spouseOf: 'N2a', birthYear: 1870, death: [18, 6, 1945] },
  { key: 'N2b', fullName: 'Đỗ Thị Thọ', gender: 'female', parent: 'N1', mother: 'W1', birthOrder: 2, birthYear: 1872, death: [9, 9, 1950] },
  { key: 'R1', fullName: 'Phạm Văn Khang', gender: 'male', spouseOf: 'N2b', birthYear: 1868, death: [1, 4, 1938] },
  { key: 'N2c', fullName: 'Đỗ Đình Khánh', gender: 'male', parent: 'N1', mother: 'W2', birthOrder: 3,
    birthYear: 1880, death: [25, 10, 1955], biography: 'Con bà thứ thất, khởi lập Chi Ất. Có công tu bổ nhà thờ họ năm 1932.' },
  { key: 'W4', fullName: 'Hoàng Thị Nga', gender: 'female', spouseOf: 'N2c', marriageOrder: 1, marriageStatus: 'widowed', birthYear: 1883, death: [14, 1, 1915] },
  { key: 'W5', fullName: 'Vũ Thị Hạnh', gender: 'female', spouseOf: 'N2c', marriageOrder: 2, birthYear: 1890, death: [22, 7, 1968] },

  // ---- Đời 3 ----
  { key: 'N3a', fullName: 'Đỗ Đình An', gender: 'male', parent: 'N2a', mother: 'W3', birthOrder: 1, birthYear: 1895, death: [2, 11, 1972] },
  { key: 'W6', fullName: 'Bùi Thị Thu', gender: 'female', spouseOf: 'N3a', birthYear: 1900, death: [16, 3, 1980] },
  { key: 'N3b', fullName: 'Đỗ Thị Bình', gender: 'female', parent: 'N2a', mother: 'W3', birthOrder: 2, birthYear: 1898, death: [7, 5, 1975] },
  { key: 'R2', fullName: 'Lý Văn Sơn', gender: 'male', spouseOf: 'N3b', birthYear: 1894, death: [11, 8, 1960] },
  { key: 'N3c', fullName: 'Đỗ Đình Cường', gender: 'male', parent: 'N2a', mother: 'W3', birthOrder: 3, birthYear: 1902, death: [28, 10, 1985] },
  { key: 'W7', fullName: 'Ngô Thị Liên', gender: 'female', spouseOf: 'N3c', birthYear: 1905, death: [30, 12, 1990] },
  { key: 'B1', fullName: 'Phạm Văn Bình', gender: 'male', parent: 'N2b', father: 'R1', birthOrder: 1, birthYear: 1895, death: [4, 2, 1965],
    note: 'Con bà Đỗ Thị Thọ – ghi vào gia phả bên ngoại.' },
  { key: 'N3d', fullName: 'Đỗ Đình Dũng', gender: 'male', parent: 'N2c', mother: 'W4', birthOrder: 1, birthYear: 1908, death: [10, 9, 1978] },
  { key: 'W8', fullName: 'Đặng Thị Yến', gender: 'female', spouseOf: 'N3d', birthYear: 1912, death: [6, 6, 1995] },
  { key: 'N3e', fullName: 'Đỗ Đình Hùng', gender: 'male', parent: 'N2c', mother: 'W5', birthOrder: 2, birthYear: 1918, death: [19, 11, 2001] },
  { key: 'W9', fullName: 'Trịnh Thị Phương', gender: 'female', spouseOf: 'N3e', birthYear: 1922, death: [24, 4, 2010] },
  { key: 'N3f', fullName: 'Đỗ Đình Nghĩa', gender: 'male', parent: 'N2c', mother: 'W5', adopted: true, birthOrder: 3, birthYear: 1925, death: [13, 10, 1999],
    biography: 'Con nuôi của cụ Khánh, được nhận vào họ năm 1930.' },

  // ---- Đời 4 ----
  { key: 'N4a', fullName: 'Đỗ Đình Tuấn', gender: 'male', parent: 'N3a', mother: 'W6', birthOrder: 1, birthDate: '1955-03-12',
    occupation: 'Nhà giáo nghỉ hưu', biography: 'Đương kim Tộc trưởng họ Đỗ.' },
  { key: 'W10', fullName: 'Phan Thị Hằng', gender: 'female', spouseOf: 'N4a', birthDate: '1958-07-20' },
  { key: 'N4b', fullName: 'Đỗ Thị Hoa', gender: 'female', parent: 'N3a', mother: 'W6', birthOrder: 2, birthDate: '1960-01-05' },
  { key: 'N4c', fullName: 'Đỗ Đình Minh', gender: 'male', parent: 'N3c', mother: 'W7', birthOrder: 1, birthDate: '1950-09-09', deathDate: '2020-11-26' },
  { key: 'W11', fullName: 'Đinh Thị Kim', gender: 'female', spouseOf: 'N4c', birthDate: '1953-02-14' },
  { key: 'N4d', fullName: 'Đỗ Thị Lan Anh', gender: 'female', parent: 'N3c', mother: 'W7', birthOrder: 2, birthDate: '1956-12-01' },
  { key: 'N4e', fullName: 'Đỗ Đình Hải', gender: 'male', parent: 'N3d', mother: 'W8', birthOrder: 1, birthDate: '1945-04-30', death: [1, 11, 2015] },
  { key: 'W12', fullName: 'Lương Thị Thảo', gender: 'female', spouseOf: 'N4e', birthDate: '1948-08-08' },
  { key: 'N4f', fullName: 'Đỗ Thị Ngọc', gender: 'female', parent: 'N3e', mother: 'W9', birthOrder: 1, birthDate: '1952-10-10' },

  // ---- Đời 5 ----
  { key: 'N5a', fullName: 'Đỗ Đình Khôi', gender: 'male', parent: 'N4a', mother: 'W10', birthOrder: 1, birthDate: '1985-06-15', occupation: 'Kỹ sư phần mềm' },
  { key: 'W13', fullName: 'Tạ Thị Linh', gender: 'female', spouseOf: 'N5a', birthDate: '1988-03-03' },
  { key: 'N5b', fullName: 'Đỗ Thị Mai Anh', gender: 'female', parent: 'N4a', mother: 'W10', birthOrder: 2, birthDate: '1988-11-20' },
  { key: 'N5c', fullName: 'Đỗ Đình Long', gender: 'male', parent: 'N4c', mother: 'W11', birthOrder: 1, birthDate: '1975-02-02' },
  { key: 'W14', fullName: 'Hồ Thị Vân', gender: 'female', spouseOf: 'N5c', birthDate: '1978-05-05' },
  { key: 'N5d', fullName: 'Đỗ Đình Phong', gender: 'male', parent: 'N4c', mother: 'W11', birthOrder: 2, birthDate: '1980-07-07' },
  { key: 'N5e', fullName: 'Đỗ Đình Quân', gender: 'male', parent: 'N4e', mother: 'W12', birthOrder: 1, birthDate: '1972-12-12' },

  // ---- Đời 6 ----
  { key: 'N6a', fullName: 'Đỗ Đình Bảo', gender: 'male', parent: 'N5a', mother: 'W13', birthOrder: 1, birthDate: '2012-04-04' },
  { key: 'N6b', fullName: 'Đỗ Thị An Nhiên', gender: 'female', parent: 'N5a', mother: 'W13', birthOrder: 2, birthDate: '2015-09-02' },
  { key: 'N6c', fullName: 'Đỗ Đình Gia Huy', gender: 'male', parent: 'N5c', mother: 'W14', birthOrder: 1, birthDate: '2005-01-01' },
  { key: 'N6d', fullName: 'Đỗ Đình Phát', gender: 'male', parent: 'N5e', birthOrder: 1, birthDate: '2000-10-20' },
];

export const branches = [
  { key: 'B_GIAP', name: 'Chi Giáp (Chi trưởng)', founder: 'N2a', description: 'Hậu duệ cụ Đỗ Đình Lộc' },
  { key: 'B_AT', name: 'Chi Ất', founder: 'N2c', description: 'Hậu duệ cụ Đỗ Đình Khánh' },
  { key: 'B_GIAP_1', name: 'Nhánh Giáp Nhất', founder: 'N3a', parent: 'B_GIAP' },
  { key: 'B_GIAP_2', name: 'Nhánh Giáp Nhị', founder: 'N3c', parent: 'B_GIAP' },
];

export const users = [
  { username: 'tocTruong', password: 'Admin@123', displayName: 'Tộc trưởng Đỗ Đình Tuấn', role: 'admin', member: 'N4a' },
  { username: 'thuKy', password: 'ThuKy@123', displayName: 'Thư ký Đỗ Đình Khôi', role: 'secretary', member: 'N5a' },
  { username: 'thanhVien', password: 'Member@123', displayName: 'Đỗ Đình Long', role: 'member', member: 'N5c' },
];
