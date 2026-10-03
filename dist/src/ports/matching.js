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
        const loc = db.get('SELECT lat, lng FROM locations WHERE id = ?', order.location_id);
        if (!loc)
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
            // لا يوجد حد مسافة مصطنع. أي مقدم خدمة مؤهل يمكن ترشيحه، حتى لو كانت المسافة كبيرة.
            // لا يمكن ترتيب مقدم خدمة لا يملك إحداثيات فعلية، لذلك لا يدخل في المطابقة الجغرافية.
            if (p.base_lat === null || p.base_lng === null)
                continue;
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
//# sourceMappingURL=matching.js.map