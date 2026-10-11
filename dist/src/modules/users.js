import { s, parse, normalizePhone, PHONE_RE } from '../core/validate.js';
import { E } from '../core/errors.js';
import { uuid, randomToken } from '../core/security.js';
import { iso } from '../core/util.js';
import { auth, roles } from './auth.middleware.js';
import { locationSchema } from './locations.js';
import { serializeUser } from './auth.js';
export function registerUserRoutes(app, r) {
    const { db } = app;
    r.get('/me/profile', auth, (ctx) => ({ user: serializeUser(app.authService.loadUser('u.id = ?', ctx.user.id)) }));
    r.patch('/me/profile', auth, (ctx) => {
        const b = parse(s.obj({
            fullName: s.str({ min: 2, max: 80, optional: true }),
            secondaryPhone: s.str({ max: 24, optional: true }),
            email: s.str({ max: 160, lower: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, patternMessage: 'بريد إلكتروني غير صالح', optional: true }),
            locale: s.oneOf(['ar', 'en'], { optional: true }),
            avatarFileId: s.str({ max: 64, optional: true }),
        }), ctx.body);
        const hasSecondaryPhone = !!ctx.body && typeof ctx.body === 'object' && Object.prototype.hasOwnProperty.call(ctx.body, 'secondaryPhone');
        const secondaryRaw = typeof b.secondaryPhone === 'string' ? b.secondaryPhone : '';
        const secondaryPhone = !secondaryRaw.trim() ? null : normalizePhone(secondaryRaw);
        if (secondaryPhone && !PHONE_RE.test(secondaryPhone))
            throw E.unprocessable('رقم التواصل الإضافي غير صالح', 'INVALID_SECONDARY_PHONE');
        if (secondaryPhone && secondaryPhone === app.authService.loadUser('u.id = ?', ctx.user.id).phone)
            throw E.unprocessable('رقم التواصل الإضافي مطابق لرقم الحساب الأساسي', 'SECONDARY_PHONE_DUPLICATE');
        return db.tx(() => {
            if (b.email && db.get('SELECT 1 FROM users WHERE email = ? AND id != ?', b.email, ctx.user.id))
                throw E.conflict('البريد الإلكتروني مسجل مسبقًا', 'EMAIL_TAKEN');
            if (b.avatarFileId && !db.get(`SELECT 1 FROM files WHERE id = ? AND owner_id = ? AND purpose = 'avatar'`, b.avatarFileId, ctx.user.id))
                throw E.unprocessable('ملف الصورة غير صالح', 'INVALID_FILE');
            db.run(`UPDATE users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), locale = COALESCE(?, locale), avatar_file_id = COALESCE(?, avatar_file_id), updated_at = ? WHERE id = ?`, b.fullName ?? null, b.email ?? null, b.locale ?? null, b.avatarFileId ?? null, iso(app.clock.now()), ctx.user.id);
            if (hasSecondaryPhone)
                db.run('UPDATE users SET secondary_phone=?, updated_at=? WHERE id=?', secondaryPhone, iso(app.clock.now()), ctx.user.id);
            const out = { user: serializeUser(app.authService.loadUser('u.id = ?', ctx.user.id)) };
            app.sse.send(ctx.user.id, 'sync', { scope: 'users' });
            return out;
        });
    });
    // Soft-delete/anonymize account records to preserve order and accounting audit integrity.
    r.delete('/me/account', auth, (ctx) => {
        if (ctx.user.role === 'ADMIN')
            throw E.forbidden('لا يمكن حذف حساب الإدارة من هذه الواجهة', 'ADMIN_ACCOUNT_DELETE_FORBIDDEN');
        const b = parse(s.obj({ confirmation: s.oneOf(['DELETE']) }), ctx.body);
        if (b.confirmation !== 'DELETE')
            throw E.unprocessable('أكد حذف الحساب أولًا', 'ACCOUNT_DELETE_CONFIRMATION_REQUIRED');
        return db.tx(() => {
            const u = app.authService.loadUser('u.id = ?', ctx.user.id);
            const activeStatuses = "('PENDING','SEARCHING','ASSIGNED','ACCEPTED','ON_THE_WAY','IN_PROGRESS','DISPUTED')";
            const active = u.role === 'CUSTOMER'
                ? db.get(`SELECT 1 FROM orders WHERE customer_id=? AND status IN ${activeStatuses} LIMIT 1`, u.id)
                : db.get(`SELECT 1 FROM orders WHERE provider_id=? AND status IN ${activeStatuses} LIMIT 1`, ctx.user.providerId || '');
            if (active)
                throw E.conflict('لا يمكن حذف الحساب قبل إغلاق الطلبات النشطة أو تسليمها بأمان', 'ACCOUNT_HAS_ACTIVE_ORDERS');
            const now = iso(app.clock.now());
            if (ctx.user.providerId) {
                db.run("UPDATE service_providers SET is_online=0, accepting_orders=0, display_name='مقدم خدمة غير نشط', bio=NULL, company_name=NULL, specialty=NULL, updated_at=? WHERE id=?", now, ctx.user.providerId);
                db.run("UPDATE order_assignments SET status='WITHDRAWN',responded_at=? WHERE provider_id=? AND status='OFFERED'", now, ctx.user.providerId);
                db.run("UPDATE quotes SET status='WITHDRAWN',updated_at=? WHERE provider_id=? AND status='SUBMITTED'", now, ctx.user.providerId);
            }
            db.run('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, ?) WHERE user_id=?', now, u.id);
            db.run(`UPDATE users SET status='DELETED', full_name='حساب محذوف', phone=?, secondary_phone=NULL, email=NULL, password_hash=?, token_version=token_version+1, avatar_file_id=NULL, updated_at=? WHERE id=?`, '+999' + uuid().replace(/-/g, '').slice(0, 12), randomToken(48), now, u.id);
            app.audit.log({ ctx, action: 'user.account_delete', entityType: 'user', entityId: u.id, before: { role: u.role, status: u.status }, after: { status: 'DELETED', anonymized: true } });
            app.sse.send(u.id, 'account_deleted', { at: now });
            return { ok: true, deleted: true, message: 'تم حذف الحساب وإخفاء بيانات التواصل الشخصية. احتُفظ بسجلات الطلبات اللازمة للتدقيق.' };
        });
    });
    const addrRow = (a, locale) => ({ id: a.id, label: a.label, isDefault: !!a.is_default, location: app.locations.serialize(db.get('SELECT * FROM locations WHERE id = ?', a.location_id), locale) });
    r.get('/me/addresses', auth, roles('CUSTOMER'), (ctx) => ({
        addresses: db.all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', ctx.user.id).map((a) => addrRow(a, ctx.locale))
    }));
    const addrCreateSchema = s.obj({ label: s.str({ min: 1, max: 40 }), location: locationSchema, isDefault: s.bool({ optional: true, default: false }) });
    r.post('/me/addresses', auth, roles('CUSTOMER'), (ctx) => {
        const b = parse(addrCreateSchema, ctx.body);
        return db.tx(() => {
            if ((db.get('SELECT COUNT(*) c FROM addresses WHERE user_id = ?', ctx.user.id)?.c ?? 0) >= 20)
                throw E.unprocessable('وصلت للحد الأقصى من العناوين (20)', 'ADDRESS_LIMIT');
            const loc = app.locations.create(b.location);
            const id = uuid();
            const first = !db.get('SELECT 1 FROM addresses WHERE user_id = ?', ctx.user.id);
            if (b.isDefault || first)
                db.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', ctx.user.id);
            db.run('INSERT INTO addresses(id,user_id,label,location_id,is_default,created_at) VALUES (?,?,?,?,?,?)', id, ctx.user.id, b.label, loc.id, b.isDefault || first ? 1 : 0, iso(app.clock.now()));
            ctx.status = 201;
            const out = { address: addrRow(db.get('SELECT * FROM addresses WHERE id = ?', id), ctx.locale) };
            app.sse.send(ctx.user.id, 'sync', { scope: 'addresses' });
            return out;
        });
    });
    const addrUpdateSchema = s.obj({ label: s.str({ min: 1, max: 40, optional: true }), isDefault: s.bool({ optional: true }), location: { ...locationSchema, optional: true } });
    r.patch('/me/addresses/:id', auth, roles('CUSTOMER'), (ctx) => {
        const b = parse(addrUpdateSchema, ctx.body);
        return db.tx(() => {
            const a = db.get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', ctx.params['id'], ctx.user.id);
            if (!a)
                throw E.notFound('العنوان غير موجود');
            if (b.location) {
                const loc = app.locations.create(b.location);
                db.run('UPDATE addresses SET location_id = ? WHERE id = ?', loc.id, a.id);
            }
            if (b.label)
                db.run('UPDATE addresses SET label = ? WHERE id = ?', b.label, a.id);
            if (b.isDefault) {
                db.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', ctx.user.id);
                db.run('UPDATE addresses SET is_default = 1 WHERE id = ?', a.id);
            }
            const out = { address: addrRow(db.get('SELECT * FROM addresses WHERE id = ?', a.id), ctx.locale) };
            app.sse.send(ctx.user.id, 'sync', { scope: 'addresses' });
            return out;
        });
    });
    r.delete('/me/addresses/:id', auth, roles('CUSTOMER'), (ctx) => {
        const res = db.run('DELETE FROM addresses WHERE id = ? AND user_id = ?', ctx.params['id'], ctx.user.id);
        if (!res.changes)
            throw E.notFound('العنوان غير موجود');
        app.sse.send(ctx.user.id, 'sync', { scope: 'addresses' });
        return undefined;
    });
}
//# sourceMappingURL=users.js.map