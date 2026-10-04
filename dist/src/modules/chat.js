import { s, parse } from '../core/validate.js';
import { E } from '../core/errors.js';
import { uuid } from '../core/security.js';
import { iso, pageParams, cursorSql, finishPage } from '../core/util.js';
import { auth, roles } from './auth.middleware.js';
const bodySchema = s.obj({ body: s.str({ min: 0, max: 2000 }), location: s.obj({ lat: s.num({ min: -90, max: 90 }), lng: s.num({ min: -180, max: 180 }), accuracy: s.num({ min: 0, max: 100000, optional: true }), addressText: s.str({ max: 300, optional: true }) }, { optional: true }) });
function canAccess(app, orderId, ctx) {
    const o = app.db.get('SELECT id,customer_id,provider_id,status FROM orders WHERE id=?', orderId);
    if (!o)
        throw E.notFound('الطلب غير موجود');
    if (ctx.user?.role === 'ADMIN')
        return o;
    if (ctx.user?.role === 'CUSTOMER' && o.customer_id === ctx.user.id)
        return o;
    if (ctx.user?.role === 'PROVIDER' && o.provider_id === ctx.user.providerId)
        return o;
    throw E.forbidden('لا تملك صلاحية الوصول إلى محادثة هذا الطلب');
}
function out(app, m) {
    const u = app.db.get('SELECT full_name FROM users WHERE id=?', m.sender_id);
    return { id: m.id, orderId: m.order_id, senderId: m.sender_id, senderRole: m.sender_role, senderName: u?.full_name || '', body: m.body, location: m.location_lat === null ? null : { lat: m.location_lat, lng: m.location_lng, accuracy: m.location_accuracy_m, addressText: m.location_address_text }, createdAt: m.created_at };
}
export function registerChatRoutes(app, r) {
    r.get('/orders/:id/messages', auth, (ctx) => {
        canAccess(app, ctx.params.id, ctx);
        const { limit, cursor } = pageParams(ctx.query);
        const c = cursorSql('m', cursor);
        const rows = app.db.all(`SELECT m.* FROM order_messages m WHERE m.order_id=?${c.sql} ORDER BY m.created_at DESC,m.id DESC LIMIT ?`, ctx.params.id, ...c.params, limit + 1);
        const { items, nextCursor } = finishPage(rows, limit);
        return { messages: items.reverse().map(x => out(app, x)), nextCursor };
    });
    r.post('/orders/:id/messages', auth, roles('CUSTOMER', 'PROVIDER'), (ctx) => {
        const o = canAccess(app, ctx.params.id, ctx);
        if (['CANCELLED'].includes(o.status))
            throw E.unprocessable('لا يمكن مراسلة الطلب بعد إلغائه', 'ORDER_CLOSED');
        const b = parse(bodySchema, ctx.body);
        if (!b.body?.trim() && !b.location)
            throw E.unprocessable('اكتب رسالة أو أرسل موقعًا', 'MESSAGE_EMPTY');
        const now = iso(app.clock.now());
        const id = uuid();
        app.db.run('INSERT INTO order_messages(id,order_id,sender_id,sender_role,body,location_lat,location_lng,location_accuracy_m,location_address_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', id, o.id, ctx.user.id, ctx.user.role, (b.body || '').trim() || '📍 الموقع المرسل', b.location?.lat ?? null, b.location?.lng ?? null, b.location?.accuracy ?? null, b.location?.addressText ?? null, now);
        const targets = new Set();
        if (o.customer_id !== ctx.user.id)
            targets.add(o.customer_id);
        if (o.provider_id) {
            const p = app.db.get('SELECT user_id FROM service_providers WHERE id=?', o.provider_id);
            if (p && p.user_id !== ctx.user.id)
                targets.add(p.user_id);
        }
        for (const uid of targets) {
            const code = app.db.get('SELECT code FROM orders WHERE id=?', o.id)?.code || '';
            app.notifications.notify(uid, 'CHAT_MESSAGE', { code }, { orderId: o.id });
            app.sse.send(uid, 'chat_message', { orderId: o.id, message: out(app, app.db.get('SELECT * FROM order_messages WHERE id=?', id)) });
        }
        ctx.status = 201;
        return { message: out(app, app.db.get('SELECT * FROM order_messages WHERE id=?', id)) };
    });
}
//# sourceMappingURL=chat.js.map