import { haversineKm, round } from '../core/util.js';
import type { Db } from '../db/database.js';
import type { App } from '../app.js';
import type { OrderRow } from '../types/domain.js';

/**
 * المطابقة تعتمد على الخدمة والحالة والتوفر ثم المسافة الجغرافية الفعلية.
 * المنطقة الإدارية ليست شرطًا للمطابقة؛ GPS هو المرجع الأساسي.
 */
export interface Candidate { providerId: string; score: number; distanceKm: number | null }
export interface Matcher { findCandidates(order: OrderRow, opts: { excludeProviderIds: string[]; limit: number }): Candidate[] }

function localParts(ms: number, tz: string): { weekday: number; hhmm: string } {
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)); }
  catch { parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Aden', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)); }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekday: wd, hhmm: `${get('hour').padStart(2, '0')}:${get('minute')}` };
}

export function isProviderAvailable(db: Db, providerId: string, ms: number, tz: string): boolean {
  const rows = db.all<{ weekday: number; start_time: string; end_time: string }>('SELECT weekday, start_time, end_time FROM provider_availability WHERE provider_id = ? AND is_available = 1', providerId);
  if (!rows.length) return true;
  const { weekday, hhmm } = localParts(ms, tz);
  return rows.some((r) => r.weekday === weekday && r.start_time <= hhmm && hhmm < r.end_time);
}

export class NearestRatedMatcher implements Matcher {
  constructor(private app: App) {}

  findCandidates(order: OrderRow, { excludeProviderIds = [], limit }: { excludeProviderIds: string[]; limit: number }): Candidate[] {
    const { db, settings } = this.app;
    const loc = db.get<{ lat: number; lng: number }>('SELECT lat, lng FROM locations WHERE id = ?', order.location_id);
    if (!loc) return [];

    const when = order.scheduled_at ? Date.parse(order.scheduled_at) : this.app.clock.now();
    const tz = settings.get<string>('platform.timezone');
    const rows = db.all<{ id: string; base_lat: number | null; base_lng: number | null }>(
      `SELECT sp.id, sp.base_lat, sp.base_lng
         FROM service_providers sp
         JOIN users u ON u.id = sp.user_id AND u.status = 'ACTIVE'
         JOIN provider_services ps ON ps.provider_id = sp.id AND ps.service_id = ? AND ps.is_active = 1
        WHERE sp.verification_status = 'VERIFIED' AND sp.is_online = 1`,
      order.service_id);

    const scored: Candidate[] = [];
    for (const p of rows) {
      if (excludeProviderIds.includes(p.id)) continue;
      if (!isProviderAvailable(db, p.id, when, tz)) continue;
      // لا يوجد حد مسافة مصطنع. أي مقدم خدمة مؤهل يمكن ترشيحه، حتى لو كانت المسافة كبيرة.
      // لا يمكن ترتيب مقدم خدمة لا يملك إحداثيات فعلية، لذلك لا يدخل في المطابقة الجغرافية.
      if (p.base_lat === null || p.base_lng === null) continue;
      const dist = haversineKm(loc.lat, loc.lng, p.base_lat, p.base_lng);
      scored.push({ providerId: p.id, distanceKm: round(dist, 2), score: round(-dist, 4) });
    }

    // الأقرب أولًا، ثم التالي فالتالي. التقييم لا يغيّر ترتيب المسافة.
    scored.sort((a, b) => {
      const d = (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
      return d || a.providerId.localeCompare(b.providerId);
    });
    return scored.slice(0, limit);
  }
}
