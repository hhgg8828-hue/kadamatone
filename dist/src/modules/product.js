import { s, parse } from '../core/validate.js';
import { E } from '../core/errors.js';
import { auth, adminLevel, roles } from './auth.middleware.js';
import { uuid } from '../core/security.js';
import { iso } from '../core/util.js';
const activeOrderStatuses = "('PENDING','SEARCHING','ASSIGNED','ACCEPTED','ON_THE_WAY','IN_PROGRESS')";
function normalizePhrase(v) {
    return String(v || '').toLowerCase().trim()
        .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
        .replace(/[ًٌٍَُِّْـ]/g, '').replace(/[.,!?،؛:()[\]{}"']/g, ' ')
        .replace(/\s+/g, ' ');
}
export function registerProductRoutes(app, r) {
    const { db, catalog } = app;
    r.get('/orders/:id/contact', auth, roles('CUSTOMER', 'PROVIDER', 'ADMIN'), (_ctx) => {
        throw E.forbidden('أرقام العملاء ومقدمي الخدمة خاصة. التواصل يتم داخل محادثة الطلب في خدمات.', 'CONTACT_PHONE_PRIVATE');
    });
    r.get('/provider/dashboard', auth, roles('PROVIDER'), (ctx) => {
        const pid = ctx.user.providerId;
        const count = (sql, ...p) => Number(db.get(sql, ...p)?.n || 0);
        const current = db.all(`SELECT id,code,status,created_at createdAt,updated_at updatedAt FROM orders WHERE provider_id=? AND status IN ${activeOrderStatuses} ORDER BY updated_at DESC LIMIT 10`, pid);
        const pending = count(`SELECT COUNT(*) n FROM order_assignments WHERE provider_id=? AND status='OFFERED'`, pid);
        const unread = count(`SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL`, ctx.user.id);
        const completed = count(`SELECT COUNT(*) n FROM orders WHERE provider_id=? AND status='COMPLETED'`, pid);
        const gross = Number(db.get(`SELECT COALESCE(SUM(COALESCE(agreed_price,price_snapshot)),0) v FROM orders WHERE provider_id=? AND status='COMPLETED'`, pid)?.v || 0);
        const due = Number(db.get(`SELECT COALESCE(SUM(commission_amount),0) v FROM provider_settlements WHERE provider_id=? AND status='DUE'`, pid)?.v || 0);
        return { current, pendingOffers: pending, unreadNotifications: unread, completedOrders: completed, gross, commissionDue: due, currency: app.settings.get('platform.currency') };
    });
    r.get('/admin/business-kpis', auth, adminLevel('SUPPORT'), (ctx) => {
        const count = (sql, ...p) => Number(db.get(sql, ...p)?.n || 0);
        const active = count(`SELECT COUNT(*) n FROM orders WHERE status IN ${activeOrderStatuses}`);
        const created = count(`SELECT COUNT(*) n FROM orders WHERE date(created_at)=date(?)`, iso(app.clock.now()));
        const completed = count(`SELECT COUNT(*) n FROM orders WHERE status='COMPLETED' AND date(completed_at)=date(?)`, iso(app.clock.now()));
        const cancelled = count(`SELECT COUNT(*) n FROM orders WHERE status='CANCELLED' AND date(cancelled_at)=date(?)`, iso(app.clock.now()));
        const noProvider = count(`SELECT COUNT(*) n FROM orders WHERE status='SEARCHING' AND provider_id IS NULL AND search_exhausted_at IS NOT NULL`);
        const verifiedOnline = count(`SELECT COUNT(*) n FROM service_providers WHERE verification_status='VERIFIED' AND is_online=1 AND accepting_orders=1`);
        const due = Number(db.get(`SELECT COALESCE(SUM(commission_amount),0) v FROM provider_settlements WHERE status='DUE'`)?.v || 0);
        const paid = Number(db.get(`SELECT COALESCE(SUM(commission_amount),0) v FROM provider_settlements WHERE status='PAID'`)?.v || 0);
        const avgResponse = Number(db.get(`SELECT COALESCE(AVG((julianday(a.responded_at)-julianday(a.offered_at))*86400),0) v FROM order_assignments a WHERE a.status='ACCEPTED' AND a.responded_at IS NOT NULL`)?.v || 0);
        return { today: { created, completed, cancelled }, activeOrders: active, ordersWithoutProvider: noProvider, availableProviders: verifiedOnline, commissionDue: due, commissionPaid: paid, avgProviderResponseSec: Math.round(avgResponse), currency: app.settings.get('platform.currency') };
    });
    r.get('/admin/settlements', auth, adminLevel('SUPPORT'), (ctx) => ({ settlements: db.all(`SELECT ps.*,o.code,sp.display_name providerName FROM provider_settlements ps JOIN orders o ON o.id=ps.order_id JOIN service_providers sp ON sp.id=ps.provider_id ORDER BY ps.created_at DESC LIMIT 300`).map(x => ({ ...x, grossAmount: Number(x.gross_amount), commissionRate: Number(x.commission_rate), commissionAmount: Number(x.commission_amount), payoutAmount: Number(x.payout_amount), currency: x.currency, dueAt: x.due_at, paidAt: x.paid_at })) }));
    // Read-only reconciliation: report financial inconsistencies without silently rewriting accounting data.
    r.get('/admin/settlements/reconciliation', auth, adminLevel('SUPPORT'), (ctx) => {
        const rows = db.all(`SELECT ps.*,o.code,o.status order_status,o.settlement_status order_settlement_status,o.provider_id order_provider_id,
      o.agreed_price,o.price_snapshot,o.currency order_currency,o.commission_rate_snapshot,o.commission_amount order_commission_amount,
      o.provider_payout_amount order_payout_amount,sp.display_name provider_name
      FROM provider_settlements ps LEFT JOIN orders o ON o.id=ps.order_id LEFT JOIN service_providers sp ON sp.id=ps.provider_id
      ORDER BY ps.created_at DESC`);
        const issues = [];
        const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.011;
        for (const row of rows) {
            const add = (code, message) => issues.push({ settlementId: row.id, orderId: row.order_id, orderCode: row.code || null, providerName: row.provider_name || null, code, message, status: row.status, orderStatus: row.order_status || null });
            if (!row.code) {
                add('ORDER_MISSING', 'سجل التسوية لا يرتبط بطلب موجود');
                continue;
            }
            if (row.order_status !== 'COMPLETED')
                add('ORDER_NOT_COMPLETED', 'التسوية مرتبطة بطلب غير مكتمل');
            if (row.order_provider_id !== row.provider_id)
                add('PROVIDER_MISMATCH', 'مقدم الخدمة في التسوية يختلف عن مقدم الطلب');
            if (row.currency !== row.order_currency)
                add('CURRENCY_MISMATCH', 'عملة التسوية تختلف عن عملة الطلب');
            const gross = Number(row.gross_amount), rate = Number(row.commission_rate), commission = Number(row.commission_amount), payout = Number(row.payout_amount);
            const orderGross = Number(row.agreed_price ?? row.price_snapshot ?? 0);
            if (![gross, rate, commission, payout, orderGross].every(Number.isFinite) || gross < 0 || rate < 0 || rate > 100 || commission < 0 || payout < 0 || !close(gross, orderGross))
                add('GROSS_MISMATCH', 'الإجمالي أو نسبة العمولة خارج الحدود أو لا يطابق سعر الطلب');
            if (!close(commission, Math.round(gross * rate) / 100))
                add('COMMISSION_MISMATCH', 'قيمة العمولة لا تطابق النسبة والإجمالي');
            if (!close(gross, commission + payout))
                add('PAYOUT_MISMATCH', 'الإجمالي لا يساوي العمولة مضافًا إليها صافي مقدم الخدمة');
            if (row.order_settlement_status !== row.status)
                add('STATUS_MISMATCH', 'حالة التسوية تختلف عن الحالة المسجلة في الطلب');
            if (row.commission_rate_snapshot != null && !close(Number(row.commission_rate_snapshot), rate))
                add('RATE_SNAPSHOT_MISMATCH', 'نسبة العمولة لا تطابق اللقطة المحفوظة مع الطلب');
            if (row.order_commission_amount != null && !close(Number(row.order_commission_amount), commission))
                add('COMMISSION_SNAPSHOT_MISMATCH', 'العمولة لا تطابق القيمة المحفوظة مع الطلب');
            if (row.order_payout_amount != null && !close(Number(row.order_payout_amount), payout))
                add('PAYOUT_SNAPSHOT_MISMATCH', 'صافي مقدم الخدمة لا يطابق القيمة المحفوظة مع الطلب');
            if (row.status === 'PAID' && (!row.paid_at || !row.paid_by))
                add('PAYMENT_METADATA_MISSING', 'التسوية مسجلة مدفوعة دون وقت أو مسؤول تسجيل الدفع');
            if (row.status === 'DUE' && (row.paid_at || row.paid_by))
                add('DUE_HAS_PAYMENT_METADATA', 'تسوية مستحقة تحتوي على بيانات دفع');
        }
        const missing = db.all(`SELECT o.id order_id,o.code,o.provider_id,o.status,o.settlement_status,o.commission_amount,o.currency
      FROM orders o LEFT JOIN provider_settlements ps ON ps.order_id=o.id
      WHERE o.status='COMPLETED' AND o.settlement_status='DUE' AND ps.id IS NULL`);
        for (const row of missing)
            issues.push({ settlementId: null, orderId: row.order_id, orderCode: row.code, providerName: null, code: 'SETTLEMENT_MISSING', message: 'طلب مكتمل عليه استحقاق لكن لا يوجد له سجل تسوية', status: null, orderStatus: row.status });
        const counts = {};
        for (const issue of issues)
            counts[issue.code] = (counts[issue.code] || 0) + 1;
        return { checkedAt: iso(app.clock.now()), settlementsChecked: rows.length, issuesCount: issues.length, counts, issues: issues.slice(0, 200), truncated: issues.length > 200 };
    });
    r.post('/admin/settlements/:id/pay', auth, adminLevel('ADMIN'), (ctx) => {
        const b = parse(s.obj({ note: s.str({ max: 500, optional: true }) }), ctx.body);
        return db.tx(() => {
            const row = db.get('SELECT * FROM provider_settlements WHERE id=?', ctx.params.id);
            if (!row)
                throw E.notFound('التسوية غير موجودة');
            if (row.status !== 'DUE')
                throw E.conflict('هذه التسوية ليست مستحقة للدفع', 'SETTLEMENT_NOT_DUE');
            const order = db.get('SELECT status,settlement_status,provider_id,agreed_price,price_snapshot,currency,commission_rate_snapshot,commission_amount,provider_payout_amount FROM orders WHERE id=?', row.order_id);
            if (!order || order.status !== 'COMPLETED' || order.provider_id !== row.provider_id || order.settlement_status !== 'DUE')
                throw E.conflict('حالة الطلب لا تتطابق مع الاستحقاق المالي؛ لم يتم تسجيل الدفع', 'SETTLEMENT_ORDER_MISMATCH');
            // لا نعتمد دفع سجل تسوية إذا كانت أرقامه لا تتفق مع سعر الطلب أو معادلة العمولة المحفوظة فيه.
            // هذا فحص اتساق محاسبي فقط؛ لا ينفذ تحصيلًا إلكترونيًا أو تحويلًا بنكيًا.
            const gross = Number(row.gross_amount), rate = Number(row.commission_rate), commission = Number(row.commission_amount), payout = Number(row.payout_amount);
            const orderGross = Number(order.agreed_price ?? order.price_snapshot ?? 0);
            const expectedCommission = Math.round(gross * rate) / 100;
            const close = (a, b) => Math.abs(a - b) < 0.011;
            const validAmounts = [gross, rate, commission, payout, orderGross].every(Number.isFinite)
                && gross >= 0 && rate >= 0 && rate <= 100 && commission >= 0 && payout >= 0
                && close(gross, orderGross)
                && close(commission, expectedCommission)
                && close(gross, commission + payout)
                && row.currency === order.currency;
            if (!validAmounts)
                throw E.conflict('مبالغ التسوية لا تتطابق مع سعر الطلب أو نسبة العمولة؛ لم يتم تسجيل الدفع', 'SETTLEMENT_AMOUNT_MISMATCH');
            if (order.commission_rate_snapshot != null && !close(Number(order.commission_rate_snapshot), rate))
                throw E.conflict('نسبة العمولة في التسوية تختلف عن النسبة المحفوظة مع الطلب', 'SETTLEMENT_AMOUNT_MISMATCH');
            if (order.commission_amount != null && !close(Number(order.commission_amount), commission))
                throw E.conflict('قيمة العمولة في التسوية تختلف عن القيمة المحفوظة مع الطلب', 'SETTLEMENT_AMOUNT_MISMATCH');
            if (order.provider_payout_amount != null && !close(Number(order.provider_payout_amount), payout))
                throw E.conflict('صافي مقدم الخدمة في التسوية لا يتطابق مع الطلب', 'SETTLEMENT_AMOUNT_MISMATCH');
            const now = iso(app.clock.now());
            // حدّث السجلين معًا؛ أي اختلاف أو سباق يؤدي إلى rollback للمعاملة كاملة.
            const paid = db.run("UPDATE provider_settlements SET status='PAID',paid_at=?,paid_by=?,note=COALESCE(?,note),updated_at=? WHERE id=? AND status='DUE'", now, ctx.user.id, b.note || null, now, row.id);
            if (!paid.changes)
                throw E.conflict('تمت تسوية هذا الاستحقاق بالفعل', 'SETTLEMENT_NOT_DUE');
            const orderPaid = db.run("UPDATE orders SET settlement_status='PAID',updated_at=?,version=version+1 WHERE id=? AND settlement_status='DUE' AND status='COMPLETED' AND provider_id=?", now, row.order_id, row.provider_id);
            if (!orderPaid.changes)
                throw E.conflict('تغيرت حالة الطلب أثناء التسوية؛ أعد المحاولة', 'SETTLEMENT_ORDER_MISMATCH');
            app.audit.log({ ctx, action: 'settlement.pay', entityType: 'provider_settlement', entityId: row.id, before: { status: 'DUE' }, after: { status: 'PAID', note: b.note || null } });
            return { ok: true };
        });
    });
    r.get('/admin/service-aliases', auth, adminLevel('SUPPORT'), () => ({ aliases: db.all(`SELECT sa.id,sa.service_id serviceId,sa.phrase,sa.normalized_phrase normalizedPhrase,sa.source,sa.is_active isActive,s.slug serviceSlug, json_extract(s.name_i18n,'$.ar') serviceName FROM service_aliases sa JOIN services s ON s.id=sa.service_id ORDER BY s.sort_order,sa.phrase`) }));
    r.post('/admin/service-aliases', auth, adminLevel('ADMIN'), (ctx) => {
        const b = parse(s.obj({ serviceId: s.str({ min: 1, max: 64 }), phrase: s.str({ min: 2, max: 120 }) }), ctx.body);
        const svc = catalog.all().services.find(x => x.id === b.serviceId);
        if (!svc)
            throw E.notFound('الخدمة غير موجودة');
        const normalized = normalizePhrase(b.phrase);
        if (!normalized)
            throw E.unprocessable('العبارة غير صالحة', 'INVALID_ALIAS');
        if (db.get('SELECT 1 FROM service_aliases WHERE service_id=? AND normalized_phrase=?', svc.id, normalized))
            throw E.conflict('هذه العبارة موجودة بالفعل', 'DUPLICATE_ALIAS');
        const id = uuid(), now = iso(app.clock.now());
        db.run('INSERT INTO service_aliases(id,service_id,phrase,normalized_phrase,source,created_at) VALUES(?,?,?,?,?,?)', id, svc.id, b.phrase, normalized, 'ADMIN', now);
        app.audit.log({ ctx, action: 'service_alias.create', entityType: 'service_alias', entityId: id, after: { serviceId: svc.id, phrase: b.phrase } });
        return { alias: { id, serviceId: svc.id, phrase: b.phrase, normalizedPhrase: normalized } };
    });
    r.patch('/admin/service-aliases/:id', auth, adminLevel('ADMIN'), (ctx) => {
        const b = parse(s.obj({ phrase: s.str({ min: 2, max: 120 }), isActive: s.bool({ optional: true }) }), ctx.body);
        const row = db.get('SELECT * FROM service_aliases WHERE id=?', ctx.params.id);
        if (!row)
            throw E.notFound('العبارة غير موجودة');
        const normalized = normalizePhrase(b.phrase);
        if (db.get('SELECT 1 FROM service_aliases WHERE service_id=? AND normalized_phrase=? AND id<>?', row.service_id, normalized, row.id))
            throw E.conflict('هذه العبارة موجودة بالفعل', 'DUPLICATE_ALIAS');
        db.run('UPDATE service_aliases SET phrase=?,normalized_phrase=?,is_active=COALESCE(?,is_active) WHERE id=?', b.phrase, normalized, b.isActive === undefined ? null : (b.isActive ? 1 : 0), row.id);
        return { ok: true };
    });
    r.delete('/admin/service-aliases/:id', auth, adminLevel('ADMIN'), (ctx) => { const row = db.get('SELECT id FROM service_aliases WHERE id=?', ctx.params.id); if (!row)
        throw E.notFound('العبارة غير موجودة'); db.run('DELETE FROM service_aliases WHERE id=?', row.id); return { ok: true }; });
}
export { normalizePhrase };
//# sourceMappingURL=product.js.map