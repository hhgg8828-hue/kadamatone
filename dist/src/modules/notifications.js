import { uuid } from '../core/security.js';
import { E } from '../core/errors.js';
import { parseJson, iso, pageParams, cursorSql, finishPage } from '../core/util.js';
import { auth } from './auth.middleware.js';
/** قوالب الإشعارات. المفاتيح ثابتة، والنص يُترجم حسب لغة المستخدم. */
export const TEMPLATES = {
    ORDER_RECEIVED: { ar: ['تم استلام طلبك', 'طلبك رقم {code} قيد البحث عن مقدم خدمة مناسب.'], en: ['Order received', 'Your order {code} is being matched with a provider.'] },
    NEW_OFFER: { ar: ['لديك طلب جديد', 'طلب «{service}» جديد في {area}. اقبله قبل غيرك.'], en: ['You have a new request', 'New “{service}” request in {area}.'] },
    ORDER_ACCEPTED: { ar: ['تم قبول طلبك من مقدم الخدمة', 'قبل {provider} تنفيذ طلبك رقم {code}.'], en: ['Your order was accepted', '{provider} accepted order {code}.'] },
    PROVIDER_ON_THE_WAY: { ar: ['مقدم الخدمة في الطريق', 'مقدم الخدمة في طريقه إليك لتنفيذ الطلب {code}.'], en: ['Provider is on the way', 'Your provider is heading to you (order {code}).'] },
    SERVICE_STARTED: { ar: ['بدأ تنفيذ الخدمة', 'بدأ تنفيذ الطلب {code}.'], en: ['Service started', 'Order {code} is now in progress.'] },
    ORDER_COMPLETED: { ar: ['تم إكمال الخدمة', 'اكتمل الطلب {code}. يمكنك الآن تقييم الخدمة.'], en: ['Service completed', 'Order {code} is complete. You can rate it now.'] },
    ORDER_CANCELLED: { ar: ['تم إلغاء الطلب', 'تم إلغاء الطلب {code}. {reason}'], en: ['Order cancelled', 'Order {code} was cancelled. {reason}'] },
    NEW_QUOTE: { ar: ['وصلك عرض سعر جديد', 'قدّم {provider} عرضًا بقيمة {amount} للطلب {code}.'], en: ['New quote received', '{provider} quoted {amount} for order {code}.'] },
    QUOTE_ACCEPTED: { ar: ['تم قبول عرض سعرك', 'اختار العميل عرضك للطلب {code}.'], en: ['Your quote was accepted', 'The customer chose your quote for order {code}.'] },
    NO_PROVIDER_FOUND: { ar: ['لم نجد مقدم خدمة بعد', 'ما زلنا نبحث للطلب {code}. يمكنك إلغاؤه أو الانتظار.'], en: ['No provider found yet', 'We are still searching for order {code}.'] },
    NO_PROVIDER_FOUND_ADMIN: { ar: ['طلب بلا مقدم خدمة', 'الطلب {code} استنفد موجات الإسناد دون قبول.'], en: ['Order without provider', 'Order {code} exhausted assignment waves.'] },
    PROVIDER_PENDING_ADMIN: { ar: ['مقدم خدمة بانتظار التوثيق', 'أرسل {provider} بيانات التوثيق للمراجعة.'], en: ['Provider awaiting verification', '{provider} submitted verification data.'] },
    PROVIDER_VERIFIED: { ar: ['تم توثيق حسابك ✓', 'يمكنك الآن استقبال الطلبات.'], en: ['Account verified', 'You can now receive requests.'] },
    PROVIDER_REJECTED: { ar: ['تم رفض طلب التوثيق', 'السبب: {reason}'], en: ['Verification rejected', 'Reason: {reason}'] },
    PROVIDER_SUSPENDED: { ar: ['تم تعليق حسابك', 'السبب: {reason}'], en: ['Account suspended', 'Reason: {reason}'] },
    PROVIDER_REACTIVATED: { ar: ['تمت إعادة تفعيل حسابك', 'يمكنك متابعة استقبال الطلبات.'], en: ['Account reactivated', 'You can receive requests again.'] },
    NEW_RATING: { ar: ['تقييم جديد', 'حصلت على {score} من 5 للطلب {code}.'], en: ['New rating', 'You received {score}/5 for order {code}.'] },
    COMPLAINT_OPENED: { ar: ['شكوى على طلب', 'فُتحت شكوى على الطلب {code}. يرجى الرد عليها.'], en: ['Complaint opened', 'A complaint was opened on order {code}. Please reply.'] },
    COMPLAINT_OPENED_ADMIN: { ar: ['شكوى جديدة', 'شكوى {complaint} على الطلب {code}.'], en: ['New complaint', 'Complaint {complaint} on order {code}.'] },
    COMPLAINT_REPLIED: { ar: ['رد جديد على الشكوى', 'هناك رد جديد على الشكوى {complaint}.'], en: ['New complaint reply', 'New reply on complaint {complaint}.'] },
    COMPLAINT_CLOSED: { ar: ['تم إغلاق الشكوى', 'تم إغلاق الشكوى {complaint}. القرار: {resolution}'], en: ['Complaint closed', 'Complaint {complaint} was closed. Resolution: {resolution}'] },
    CHAT_MESSAGE: { ar: ['رسالة جديدة', 'لديك رسالة جديدة في الطلب {code}.'], en: ['New message', 'You have a new message on order {code}.'] },
};
const interpolate = (str, params) => str.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
export function renderNotification(row, locale = 'ar') {
    const t = TEMPLATES[row.type]?.[locale] || TEMPLATES[row.type]?.['ar'] || [row.type, ''];
    const params = parseJson(row.params, {}) ?? {};
    return { id: row.id, type: row.type, title: interpolate(t[0], params), body: interpolate(t[1], params), data: parseJson(row.data, {}), read: !!row.read_at, readAt: row.read_at, createdAt: row.created_at };
}
export function createNotifications(app) {
    const { db } = app;
    /** قنوات التوصيل (Port: NotificationChannel). InApp الآن؛ FCM/SMS لاحقًا بنفس الواجهة. */
    const channels = [
        { name: 'in_app', deliver: (userId, n) => app.sse.send(userId, 'notification', n) },
    ];
    const svc = {
        channels,
        notify(userId, type, params = {}, data = {}) {
            if (!TEMPLATES[type])
                throw new Error(`unknown notification type ${type}`);
            const row = { id: uuid(), user_id: userId, type, params: JSON.stringify(params), data: JSON.stringify(data), read_at: null, created_at: iso(app.clock.now()) };
            db.run('INSERT INTO notifications(id,user_id,type,params,data,created_at) VALUES (?,?,?,?,?,?)', row.id, userId, type, row.params, row.data, row.created_at);
            db.afterCommit(() => {
                const locale = (db.get('SELECT locale FROM users WHERE id = ?', userId)?.locale) || 'ar';
                const rendered = renderNotification(row, locale);
                for (const ch of channels) {
                    try {
                        ch.deliver(userId, rendered);
                    }
                    catch (e) {
                        app.log.warn('channel_failed', { channel: ch.name, err: String(e) });
                    }
                }
            });
            return row.id;
        },
        notifyAdmins(type, params = {}, data = {}) {
            for (const a of db.all(`SELECT u.id FROM users u JOIN admin_users au ON au.user_id = u.id WHERE u.status = 'ACTIVE'`))
                svc.notify(a.id, type, params, data);
        },
        list(userId, query, locale) {
            const { limit, cursor } = pageParams(query);
            const c = cursorSql('n', cursor);
            const unreadOnly = query['unread'] === 'true' ? ' AND n.read_at IS NULL' : '';
            const rows = db.all(`SELECT n.* FROM notifications n WHERE n.user_id = ?${unreadOnly}${c.sql} ORDER BY n.created_at DESC, n.id DESC LIMIT ?`, userId, ...c.params, limit + 1);
            const { items, nextCursor } = finishPage(rows, limit);
            return { notifications: items.map((rr) => renderNotification(rr, locale)), nextCursor, unreadCount: db.get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL', userId).c };
        },
    };
    return svc;
}
export function registerNotificationRoutes(app, r) {
    const { db, notifications } = app;
    r.get('/notifications', auth, (ctx) => notifications.list(ctx.user.id, ctx.query, ctx.user.locale));
    r.post('/notifications/read-all', auth, (ctx) => {
        db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', iso(app.clock.now()), ctx.user.id);
        return { ok: true };
    });
    r.post('/notifications/:id/read', auth, (ctx) => {
        const res = db.run('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?', iso(app.clock.now()), ctx.params['id'], ctx.user.id);
        if (!res.changes)
            throw E.notFound();
        return { ok: true };
    });
    // SSE: تذكرة قصيرة العمر لمرة واحدة (EventSource لا يدعم ترويسة Authorization)
    r.post('/events/ticket', auth, (ctx) => {
        const ticket = uuid() + uuid();
        app.sseTickets.set(ticket, { userId: ctx.user.id, exp: app.clock.now() + 60_000 });
        return { ticket, expiresIn: 60 };
    });
    r.get('/events', (ctx) => {
        const key = String(ctx.query['ticket'] || '');
        const t = app.sseTickets.get(key);
        app.sseTickets.delete(key);
        if (!t || t.exp < app.clock.now())
            throw E.unauthorized('تذكرة غير صالحة', 'INVALID_TICKET');
        ctx.res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
        ctx.res.write('retry: 3000\n\n');
        app.sse.add(t.userId, ctx.res);
        ctx.raw = true;
    });
}
//# sourceMappingURL=notifications.js.map