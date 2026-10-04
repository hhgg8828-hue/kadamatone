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
    const loc = order.location_provided === 0 ? null : db.get<{ lat: number; lng: number }>('SELECT lat, lng FROM locations WHERE id = ?', order.location_id);
    if (order.location_provided !== 0 && !loc) return [];

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
      // إذا لم يحدد العميل موقعًا، لا نفشل المطابقة: نستخدم التقييم كترتيب احتياطي.
      // عند توفر الموقع، نفضّل المسافة الفعلية.
      if (loc && (p.base_lat === null || p.base_lng === null)) continue;
      const serviceAreas = db.all<{area_id:string}>(`SELECT area_id FROM service_area_rules WHERE service_id=?`, order.service_id);
      if (serviceAreas.length && order.location_provided !== 0 && order.area_id) {
        const chain = new Set(this.app.catalog.areaChain(String(order.area_id)));
        if (!serviceAreas.some(x => chain.has(x.area_id))) continue;
      }
      // مقدم الخدمة قد يغطي قرية أو عزلة أو مديرية محددة. المنطقة الأب تغطي أبناءها.
      const providerAreas = db.all<{area_id:string}>(`SELECT area_id FROM provider_service_areas WHERE provider_id=?`, p.id);
      if (providerAreas.length && order.location_provided !== 0 && order.area_id) {
        const chain = new Set(this.app.catalog.areaChain(String(order.area_id)));
        if (!providerAreas.some(x => chain.has(x.area_id))) continue;
      }
      const live = db.get<{lat:number;lng:number;updated_at:string}>(`SELECT lat,lng,updated_at FROM provider_live_locations WHERE provider_id=? AND updated_at >= ?`, p.id, new Date(this.app.clock.now()-5*60_000).toISOString());
      const candidatePoint = live ? {lat:Number(live.lat),lng:Number(live.lng)} : (p.base_lat !== null && p.base_lng !== null ? {lat:Number(p.base_lat),lng:Number(p.base_lng)} : null);
      const dist = loc && candidatePoint ? haversineKm(loc.lat, loc.lng, candidatePoint.lat, candidatePoint.lng) : null;
      const profile = db.get<{rating_avg:number;rating_count:number}>('SELECT rating_avg,rating_count FROM service_providers WHERE id=?',p.id);
      const rating = Number(profile?.rating_avg||0);
      const completed = Number(db.get<{c:number}>("SELECT COUNT(*) c FROM orders WHERE provider_id=? AND status='COMPLETED'",p.id)?.c||0);
      const favorite = db.get('SELECT 1 FROM favorite_providers WHERE customer_id=? AND provider_id=?',order.customer_id,p.id) ? 1 : 0;
      const distanceComponent = dist === null ? 0 : Math.max(0, 1 - Math.min(dist, 50)/50);
      const qualityComponent = Math.min(1, rating/5);
      const experienceComponent = Math.min(1, completed/50);
      const composite = dist === null ? qualityComponent*0.65 + favorite*0.25 + experienceComponent*0.10 : distanceComponent*0.65 + qualityComponent*0.20 + favorite*0.10 + experienceComponent*0.05;
      scored.push({ providerId: p.id, distanceKm: dist === null ? null : round(dist, 2), score: round(composite, 6) });
    }

    // ترتيب عملي مركّب: الموقع الحي إن وجد، الجودة، تفضيل العميل، والخبرة.
    scored.sort((a, b) => (b.score - a.score) || ((a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY)) || a.providerId.localeCompare(b.providerId));
    return scored.slice(0, limit);
  }
}
