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
            const dist = loc && p.base_lat !== null && p.base_lng !== null ? haversineKm(loc.lat, loc.lng, p.base_lat, p.base_lng) : null;
            const rating = Number(db.get('SELECT rating_avg FROM service_providers WHERE id=?', p.id)?.rating_avg || 0);
            scored.push({ providerId: p.id, distanceKm: dist === null ? null : round(dist, 2), score: dist === null ? round(rating, 4) : round(-dist + rating * 0.001, 4) });
        }
        // الأقرب أولًا، ثم التالي فالتالي. التقييم لا يغيّر ترتيب المسافة.
        scored.sort((a, b) => {
            const d = (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
            return d || a.providerId.localeCompare(b.providerId);
        });
        return scored.slice(0, limit);
    }
}
//# sourceMappingURL=matching.js.map