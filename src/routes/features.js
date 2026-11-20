/**
 * Các tính năng đặc thù: Lịch giỗ (Âm lịch), Tính xưng hô (LCA), Tiện ích quy đổi lịch.
 */
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { config } from '../config.js';
import { requireRead } from '../middleware/auth.js';
import { HttpError } from '../utils/http.js';
import { loadKinshipGraph } from '../services/memberService.js';
import { createKinshipGraph, computeKinship } from '../shared/kinship.js';
import {
  canChiYear, lunarToSolar, memorialLabel, memorialSolarDate, parseISO, solarToLunar, todayVN, toISO, upcomingMemorials, weekdayVN,
} from '../shared/lunar.js';

const r = Router();

const deceasedQuery = () =>
  db.q(`SELECT m.id, m.full_name, m.gender, m.generation, m.is_lineage, m.death_date, m.death_year,
               m.death_lunar_day, m.death_lunar_month, m.death_lunar_year, m.death_lunar_leap, m.burial_place,
               (SELECT string_agg(s.full_name, ', ') FROM marriages g
                  JOIN members s ON s.id = CASE WHEN g.husband_id = m.id THEN g.wife_id ELSE g.husband_id END
                 WHERE m.id IN (g.husband_id, g.wife_id)) AS spouse_names
          FROM members m
         WHERE NOT m.is_alive AND m.death_lunar_day IS NOT NULL AND m.death_lunar_month IS NOT NULL`);

/**
 * GET /api/memorials/upcoming?days=30&from=YYYY-MM-DD
 * Quy đổi ngày mất (Âm lịch) sang Dương lịch của năm hiện tại/năm sau và lọc trong N ngày tới.
 */
r.get('/memorials/upcoming', requireRead, async (req, res) => {
  const q = z.object({ days: z.coerce.number().int().min(1).max(400).default(30), from: z.string().optional() }).parse(req.query);
  const from = q.from ? parseISO(q.from) : todayVN();
  const items = upcomingMemorials(await deceasedQuery(), { days: q.days, from });
  const lunarToday = solarToLunar(from.day, from.month, from.year);
  res.json({
    today: toISO(from),
    todayLunar: { ...lunarToday, text: `${lunarToday.day}/${lunarToday.month} năm ${canChiYear(lunarToday.year)}` },
    days: q.days,
    items,
  });
});

/**
 * GET /api/memorials/calendar.ics?token=<calendar_token>
 * Lịch giỗ dạng iCalendar – đăng ký trên Google Calendar / iPhone để nhận nhắc nhở tự động
 * (nhắc trước 7 ngày và 1 ngày).
 */
r.get('/memorials/calendar.ics', async (req, res) => {
  if (config.readAccess !== 'public') {
    const token = z.string().uuid().safeParse(req.query.token);
    const u = token.success ? await db.one(`SELECT id FROM users WHERE calendar_token = $1 AND is_active`, [token.data]) : null;
    if (!u) throw new HttpError(401, 'Thiếu hoặc sai token lịch');
  }
  const members = await deceasedQuery();
  const today = todayVN();
  const ly = solarToLunar(today.day, today.month, today.year).year;
  const esc = (s) => String(s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const ymd = (iso) => iso.replaceAll('-', '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GiaPha//Lich Gio//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`Lịch giỗ ${config.clanName}`)}`, 'X-WR-TIMEZONE:Asia/Ho_Chi_Minh'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  for (const m of members) {
    for (const year of [ly, ly + 1]) {
      const mem = memorialSolarDate(m.deathLunarDay, m.deathLunarMonth, year);
      if (!mem) continue;
      const nth = m.deathLunarYear ? year - m.deathLunarYear : null;
      if (nth !== null && nth < 1) continue;
      const start = toISO(mem.solar);
      const endJs = new Date(Date.UTC(mem.solar.year, mem.solar.month - 1, mem.solar.day + 1));
      const end = endJs.toISOString().slice(0, 10);
      lines.push(
        'BEGIN:VEVENT',
        `UID:gio-${m.id}-${year}@giapha`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(start)}`,
        `DTEND;VALUE=DATE:${ymd(end)}`,
        `SUMMARY:${esc(`Giỗ ${m.fullName}${m.generation ? ` (đời ${m.generation})` : ''}`)}`,
        `DESCRIPTION:${esc(`${nth ? memorialLabel(nth) : 'Ngày giỗ'} – ngày ${mem.lunar.day}/${mem.lunar.month} năm ${canChiYear(year)} (Âm lịch).` +
          (m.burialPlace ? `\nMộ phần: ${m.burialPlace}` : ''))}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P7D', `DESCRIPTION:${esc(`Còn 7 ngày đến giỗ ${m.fullName}`)}`, 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1D', `DESCRIPTION:${esc(`Ngày mai giỗ ${m.fullName}`)}`, 'END:VALARM',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="lich-gio.ics"');
  res.send(lines.join('\r\n'));
});

/**
 * GET /api/kinship?a=<id>&b=<id>
 * Tìm tổ tiên chung gần nhất (LCA) và trả về cách xưng hô Bắc/Trung/Nam.
 */
r.get('/kinship', requireRead, async (req, res) => {
  const { a, b } = z.object({ a: z.coerce.number().int(), b: z.coerce.number().int() }).parse(req.query);
  const { members, marriages } = await loadKinshipGraph(db, a, b);
  res.json(computeKinship(createKinshipGraph(members, marriages), a, b));
});

/**
 * GET /api/lunar/convert?solar=YYYY-MM-DD
 * GET /api/lunar/convert?lunarDay=&lunarMonth=&lunarYear=&leap=
 */
r.get('/lunar/convert', (req, res) => {
  const q = req.query;
  if (q.solar) {
    const s = parseISO(String(q.solar));
    const l = solarToLunar(s.day, s.month, s.year);
    return res.json({ solar: toISO(s), weekday: weekdayVN(s), lunar: { ...l, yearName: canChiYear(l.year) } });
  }
  const p = z
    .object({ lunarDay: z.coerce.number().int().min(1).max(30), lunarMonth: z.coerce.number().int().min(1).max(12),
      lunarYear: z.coerce.number().int().min(1800).max(2199), leap: z.enum(['true', 'false']).optional() })
    .parse(q);
  const s = lunarToSolar(p.lunarDay, p.lunarMonth, p.lunarYear, p.leap === 'true');
  if (!s) throw new HttpError(400, 'Ngày Âm lịch không tồn tại (kiểm tra tháng nhuận)');
  res.json({ solar: toISO(s), weekday: weekdayVN(s), lunar: { day: p.lunarDay, month: p.lunarMonth, year: p.lunarYear, leap: p.leap === 'true', yearName: canChiYear(p.lunarYear) } });
});

export default r;
