// Chạy: npm test  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { people } from '../src/db/seedData.js';
import { createKinshipGraph, computeKinship } from '../src/shared/kinship.js';
import { lunarToSolar, solarToLunar, leapMonthOfYear, upcomingMemorials, memorialSolarDate } from '../src/shared/lunar.js';

// Dựng đồ thị từ dữ liệu mẫu (không cần DB)
const ids = new Map(people.map((p, i) => [p.key, i + 1]));
const members = people.map((p) => ({
  id: ids.get(p.key),
  fullName: p.fullName,
  gender: p.gender,
  isLineage: !p.spouseOf,
  lineageParentId: p.parent ? ids.get(p.parent) : null,
  lineageLinkType: p.adopted ? 'adopted' : 'biological',
  fatherId: p.father ? ids.get(p.father) : p.parent && people.find((x) => x.key === p.parent).gender === 'male' ? ids.get(p.parent) : null,
  motherId: p.mother ? ids.get(p.mother) : p.parent && people.find((x) => x.key === p.parent).gender === 'female' ? ids.get(p.parent) : null,
  birthOrder: p.birthOrder ?? null,
  birthDate: p.birthDate ?? null,
  birthYear: p.birthYear ?? null,
}));
const marriages = people
  .filter((p) => p.spouseOf)
  .map((p, i) => {
    const other = ids.get(p.spouseOf);
    const me = ids.get(p.key);
    return {
      id: i + 1,
      husbandId: p.gender === 'male' ? me : other,
      wifeId: p.gender === 'female' ? me : other,
      wifeRank: p.wifeRank ?? 1,
      status: p.marriageStatus ?? 'married',
    };
  });
const g = createKinshipGraph(members, marriages);
const k = (a, b) => computeKinship(g, ids.get(a), ids.get(b));

test('cha – con, ông – cháu nội', () => {
  assert.equal(k('N6a', 'N5a').aCallsB.bac, 'Bố');
  assert.equal(k('N6a', 'N5a').aCallsB.nam, 'Ba');
  assert.equal(k('N5a', 'N6a').aCallsB.bac, 'Con trai');
  assert.equal(k('N6a', 'N4a').aCallsB.bac, 'Ông nội');
  assert.equal(k('N6a', 'N3a').aCallsB.bac, 'Cụ ông');
  assert.equal(k('N6a', 'N3a').aCallsB.nam, 'Ông cố');
  assert.equal(k('N6a', 'W10').aCallsB.bac, 'Bà nội');
});

test('chú – bác – cô theo vai', () => {
  // N4b (Hoa) là em gái của bố Khôi (Tuấn)
  assert.equal(k('N5a', 'N4b').aCallsB.bac, 'Cô');
  assert.equal(k('N5a', 'N4b').aCallsB.trung, 'O');
  assert.equal(k('N4b', 'N5a').aCallsB.bac, 'Cháu');
  // Bố của Long (Minh) là con nhà chú (Cường – thứ 3) so với ông An (thứ 1)
  // => Tuấn (nhánh trên) là "Bác họ" của Long dù Tuấn ít tuổi hơn Minh
  assert.equal(k('N5c', 'N4a').aCallsB.bac, 'Bác họ');
  assert.equal(k('N5a', 'N4c').aCallsB.bac, 'Chú họ');
  // Vợ của chú họ
  assert.equal(k('N5a', 'W11').aCallsB.bac, 'Thím họ');
});

test('anh em họ theo nhánh, không theo tuổi', () => {
  // Minh (1950) là con chú, Tuấn (1955) là con bác => Minh gọi Tuấn là Anh họ
  assert.equal(k('N4c', 'N4a').aCallsB.bac, 'Anh họ');
  assert.equal(k('N4a', 'N4c').aCallsB.bac, 'Em trai họ');
  assert.match(k('N4c', 'N4a').explanation, /con chú con bác/);
});

test('anh chị em ruột / cùng cha khác mẹ / dâu', () => {
  assert.equal(k('N5b', 'N5a').aCallsB.bac, 'Anh');
  assert.equal(k('N5a', 'N5b').aCallsB.bac, 'Em gái');
  assert.equal(k('N3e', 'N3d').aCallsB.bac, 'Anh (cùng cha khác mẹ)');
  assert.equal(k('N5b', 'W13').aCallsB.bac, 'Chị dâu');
  assert.equal(k('W13', 'N5b').aCallsB.bac, 'Em chồng');
  assert.equal(k('W13', 'N4a').aCallsB.bac, 'Bố chồng');
});

test('bên ngoại: cậu', () => {
  // Bình là con bà Thọ; Lộc là anh trai bà Thọ => miền Bắc: Bác, miền Nam: Cậu
  assert.equal(k('B1', 'N2a').aCallsB.bac, 'Bác');
  assert.equal(k('B1', 'N2a').aCallsB.nam, 'Cậu');
  assert.equal(k('B1', 'N2c').aCallsB.bac, 'Cậu');
  assert.equal(k('B1', 'N1').aCallsB.bac, 'Ông ngoại');
});

test('vợ chồng, vợ cả – vợ lẽ', () => {
  assert.equal(k('N1', 'W2').aCallsB.bac, 'Vợ (vợ hai)');
  assert.equal(k('W2', 'W1').aCallsB.bac, 'Chị cả (vợ cả)');
  assert.equal(k('N3e', 'W4').aCallsB.bac, 'Dì (vợ khác của cha)');
});

test('ông chú, con nuôi', () => {
  assert.equal(k('N5a', 'N3c').aCallsB.bac, 'Ông chú');
  assert.equal(k('N3f', 'N2c').aCallsB.bac, 'Bố nuôi');
  const r = k('N6a', 'N6c');
  assert.equal(r.lca.fullName, 'Đỗ Đình Lộc');
  assert.equal(r.aCallsB.bac, 'Em trai họ');
});

test('lịch âm', () => {
  assert.deepEqual(lunarToSolar(1, 1, 2026), { day: 17, month: 2, year: 2026 });
  assert.deepEqual(solarToLunar(2, 9, 1945), { day: 26, month: 7, year: 1945, leap: false });
  assert.equal(leapMonthOfYear(2025), 6);
  assert.equal(leapMonthOfYear(2023), 2);
  // ngày 30 không tồn tại -> 29
  const r = memorialSolarDate(30, 10, 2026);
  assert.ok(r.lunar.day === 30 || r.lunar.day === 29);
  const up = upcomingMemorials([{ id: 1, fullName: 'X', deathLunarDay: 12, deathLunarMonth: 10, deathLunarYear: 2000 }], {
    from: { day: 18, month: 11, year: 2026 },
  });
  assert.equal(up[0].daysLeft, 2);
  assert.equal(up[0].nth, 26);
});
