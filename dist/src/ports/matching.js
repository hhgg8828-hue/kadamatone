import { haversineKm, round } from '../core/util.js';
function localParts(ms, tz) {
    let parts;
    try {
        parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    }
    catch {
        parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Aden', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    }
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { weekday: wd, hhmm: `${get('hour').padStart(2, '0')}:${get('minute')}` };
}
export function isProviderAvailable(db, providerId, ms, tz) {
    const rows = db.all('SELECT weekday, start_time, end_time FROM provider_availability WHERE provider_id = ? AND is_available = 1', providerId);
    if (!rows.length)
        return true;
    const { weekday, hhmm } = localParts(ms, tz);
    return rows.some((r) => r.weekday === weekday && r.start_time <= hhmm && hhmm < r.end_time);
}
export class NearestRatedMatcher {
    app;
    constructor(app) {
        this.app = app;
    }
    findCandidates(order, { excludeProviderIds = [], limit }) {
        const { db, settings } = this.app;
        const loc = order.location_provided === 0 ? null : db.get('SELECT lat, lng FROM locations WHERE id = ?', order.location_id);
        if (order.location_provided !== 0 && !loc)
            return [];
        const when = order.scheduled_at ? Date.parse(order.scheduled_at) : this.app.clock.now();
        const tz = settings.get('platform.timezone');
        const rows = db.all(`SELECT sp.id, sp.base_lat, sp.base_lng
         FROM service_providers sp
         JOIN users u ON u.id = sp.user_id AND u.status = 'ACTIVE'
         JOIN provider_services ps ON ps.provider_id = sp.id AND ps.service_id = ? AND ps.is_active = 1
        WHERE sp.verification_status = 'VERIFIED' AND sp.is_online = 1`, order.service_id);
        const scored = [];
        for (const p of rows) {
            if (excludeProviderIds.includes(p.id))
                continue;
            if (!isProviderAvailable(db, p.id, when, tz))
                continue;
            // إذا لم يحدد العميل موقعًا، لا نفشل المطابقة: نستخدم التقييم كترتيب احتياطي.
            // عند توفر الموقع، نفضّل المسافة الفعلية.
            if (loc && (p.base_lat === null || p.base_lng === null))
                continue;
            const serviceAreas = db.all(`SELECT area_id FROM service_area_rules WHERE service_id=?`, order.service_id);
            if (serviceAreas.length) {
                const allowed = new Set(serviceAreas.map(x => x.area_id));
                const orderArea = order.location_provided === 0 ? '' : (order.area_id ? String(order.area_id) : '');
                if (order.location_provided !== 0 && !allowed.has(orderArea))
                    continue;
            }
            const live = db.get(`SELECT lat,lng,updated_at FROM provider_live_locations WHERE provider_id=? AND updated_at >= ?`, p.id, new Date(this.app.clock.now() - 5 * 60_000).toISOString());
            const candidatePoint = live ? { lat: Number(live.lat), lng: Number(live.lng) } : (p.base_lat !== null && p.base_lng !== null ? { lat: Number(p.base_lat), lng: Number(p.base_lng) } : null);
            const dist = loc && candidatePoint ? haversineKm(loc.lat, loc.lng, candidatePoint.lat, candidatePoint.lng) : null;
            const profile = db.get('SELECT rating_avg,rating_count FROM service_providers WHERE id=?', p.id);
            const rating = Number(profile?.rating_avg || 0);
            const completed = Number(db.get("SELECT COUNT(*) c FROM orders WHERE provider_id=? AND status='COMPLETED'", p.id)?.c || 0);
            const favorite = db.get('SELECT 1 FROM favorite_providers WHERE customer_id=? AND provider_id=?', order.customer_id, p.id) ? 1 : 0;
            const distanceComponent = dist === null ? 0 : Math.max(0, 1 - Math.min(dist, 50) / 50);
            const qualityComponent = Math.min(1, rating / 5);
            const experienceComponent = Math.min(1, completed / 50);
            const composite = dist === null ? qualityComponent * 0.65 + favorite * 0.25 + experienceComponent * 0.10 : distanceComponent * 0.65 + qualityComponent * 0.20 + favorite * 0.10 + experienceComponent * 0.05;
            scored.push({ providerId: p.id, distanceKm: dist === null ? null : round(dist, 2), score: round(composite, 6) });
        }
        // ترتيب عملي مركّب: الموقع الحي إن وجد، الجودة، تفضيل العميل، والخبرة.
        scored.sort((a, b) => (b.score - a.score) || ((a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY)) || a.providerId.localeCompare(b.providerId));
        return scored.slice(0, limit);
    }
}
//# sourceMappingURL=matching.js.map