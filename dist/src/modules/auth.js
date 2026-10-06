import { s, parse, normalizePhone, PHONE_RE } from '../core/validate.js';
import { E } from '../core/errors.js';
import { hashPassword, verifyPassword, fakeVerify, signJwt, randomToken, sha256, uuid } from '../core/security.js';
import { iso } from '../core/util.js';
import { limit } from '../core/rateLimit.js';
import { auth } from './auth.middleware.js';
const COOKIE = 'khadamat_rt';
const PASSWORD = s.str({ min: 8, max: 128, trim: false, patternMessage: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
const PHONE = s.str({ min: 8, max: 24 });
const EMAIL = s.str({ max: 160, lower: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, patternMessage: 'بريد إلكتروني غير صالح', optional: true });
function cleanPhone(raw) {
    const p = normalizePhone(raw);
    if (!PHONE_RE.test(p))
        throw E.unprocessable('رقم هاتف غير صالح', 'VALIDATION_ERROR', [{ path: 'phone', message: 'رقم هاتف غير صالح' }]);
    return p;
}
export function serializeUser(u) {
    return { id: u.id, fullName: u.full_name, phone: u.phone, email: u.email || null, role: u.role, locale: u.locale, status: u.status,
        avatarUrl: u.avatar_file_id ? `/api/v1/files/${u.avatar_file_id}` : null, adminLevel: u.admin_level ?? null };
}
export function createAuthService(app) {
    const { db, config } = app;
    const cookies = (header) => Object.fromEntries(String(header || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2));
    function setCookie(ctx, token, maxAgeSec) {
        ctx.headers['Set-Cookie'] = `${COOKIE}=${token}; HttpOnly; Path=/api/v1/auth; SameSite=Strict; Max-Age=${maxAgeSec}${config.cookieSecure ? '; Secure' : ''}`;
    }
    function issueSession(ctx, userRow, familyId = uuid()) {
        const token = randomToken(48);
        const ttl = config.refreshTtlDays * 86400;
        db.run('INSERT INTO refresh_tokens(id,user_id,family_id,token_hash,expires_at,ip,user_agent,created_at) VALUES (?,?,?,?,?,?,?,?)', uuid(), userRow.id, familyId, sha256(token), iso(app.clock.now() + ttl * 1000), ctx.ip, ctx.userAgent, iso(app.clock.now()));
        setCookie(ctx, token, ttl);
        const accessToken = signJwt({ sub: userRow.id, role: userRow.role, tv: userRow.token_version }, config.jwtSecret, config.accessTtlSec, app.clock.now());
        const out = { accessToken, expiresIn: config.accessTtlSec };
        if (ctx.req.headers['x-client-type'] === 'native')
            out.refreshToken = token;
        return out;
    }
    const loadUser = (where, ...p) => db.get(`SELECT u.*, r.code AS role, au.admin_level FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN admin_users au ON au.user_id = u.id WHERE ${where}`, ...p);
    return { issueSession, loadUser, cookies, setCookie, COOKIE };
}
const registerSchema = s.obj({
    fullName: s.str({ min: 2, max: 80 }),
    phone: PHONE,
    email: EMAIL,
    password: PASSWORD,
    role: s.oneOf(['CUSTOMER', 'PROVIDER']),
    locale: s.oneOf(['ar', 'en'], { optional: true, default: 'ar' }),
    provider: s.obj({
        providerType: s.oneOf(['INDIVIDUAL', 'TECHNICIAN', 'DRIVER', 'WORKER', 'COMPANY']),
        displayName: s.str({ min: 2, max: 80, optional: true }),
        companyName: s.str({ min: 2, max: 120, optional: true }),
        bio: s.str({ max: 1000, optional: true }),
        specialty: s.str({ max: 120, optional: true }),
    }, { optional: true }),
});
export function registerAuthRoutes(app, r) {
    const { db } = app;
    const svc = app.authService;
    r.post('/auth/register', limit('register', { max: 10, windowMs: 3600_000 }), async (ctx) => {
        const b = parse(registerSchema, ctx.body);
        const phone = cleanPhone(b.phone);
        if (b.role === 'PROVIDER' && !b.email)
            throw E.unprocessable('البريد الإلكتروني إلزامي لمقدم الخدمة', 'PROVIDER_EMAIL_REQUIRED', [{ path: 'email', message: 'هذا الحقل مطلوب لمقدم الخدمة' }]);
        if (b.role === 'PROVIDER' && !b.provider)
            throw E.unprocessable('بيانات مقدم الخدمة مطلوبة', 'VALIDATION_ERROR', [{ path: 'provider', message: 'هذا الحقل مطلوب' }]);
        const companyName = b.provider?.providerType === 'COMPANY' ? (b.provider.companyName || b.provider.displayName) : b.provider?.companyName;
        if (b.provider?.providerType === 'COMPANY' && !companyName)
            throw E.unprocessable('اسم الشركة مطلوب', 'VALIDATION_ERROR', [{ path: 'provider.companyName', message: 'هذا الحقل مطلوب' }]);
        const hash = await hashPassword(b.password);
        const userRow = db.tx(() => {
            if (db.get('SELECT 1 FROM users WHERE phone = ?', phone))
                throw E.conflict('رقم الهاتف مسجل مسبقًا', 'PHONE_TAKEN');
            if (b.email && db.get('SELECT 1 FROM users WHERE email = ?', b.email))
                throw E.conflict('البريد الإلكتروني مستخدم بالفعل', 'EMAIL_TAKEN');
            const id = uuid(), now = iso(app.clock.now());
            db.run('INSERT INTO users(id,role_id,full_name,phone,email,password_hash,locale,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', id, b.role === 'PROVIDER' ? 2 : 1, b.fullName, phone, b.email || null, hash, b.locale, now, now);
            if (b.role === 'PROVIDER' && b.provider) {
                db.run('INSERT INTO service_providers(id,user_id,provider_type,display_name,bio,company_name,specialty,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', uuid(), id, b.provider.providerType, b.provider.displayName || b.provider.companyName || b.fullName, b.provider.bio || null, companyName || null, b.provider.specialty || null, now, now);
                app.notifications.notifyAdmins('PROVIDER_PENDING_ADMIN', { provider: b.provider.displayName || b.fullName }, { userId: id });
            }
            return svc.loadUser('u.id = ?', id);
        });
        ctx.status = 201;
        return { user: serializeUser(userRow), ...svc.issueSession(ctx, userRow) };
    });
    r.post('/auth/login', limit('login-ip', { max: 30, windowMs: 60_000 }), limit('login-id', { max: 8, windowMs: 15 * 60_000, key: (c) => String(c.body?.identifier || '').toLowerCase().slice(0, 100) }), async (ctx) => {
        const b = parse(s.obj({ identifier: s.str({ min: 3, max: 160 }), password: s.str({ min: 1, max: 128, trim: false }), role: s.oneOf(['CUSTOMER', 'PROVIDER', 'ADMIN'], { optional: true }) }), ctx.body);
        const id = b.identifier.includes('@') ? b.identifier.toLowerCase() : normalizePhone(b.identifier);
        const u = svc.loadUser(id.includes('@') ? 'u.email = ?' : 'u.phone = ?', id);
        if (!u) {
            await fakeVerify(b.password);
            throw E.unauthorized('بيانات الدخول غير صحيحة', 'INVALID_CREDENTIALS');
        }
        const ok = await verifyPassword(b.password, u.password_hash);
        if (!ok)
            throw E.unauthorized('بيانات الدخول غير صحيحة', 'INVALID_CREDENTIALS');
        if (u.status !== 'ACTIVE')
            throw E.forbidden('هذا الحساب موقوف. تواصل مع الدعم.', 'ACCOUNT_INACTIVE');
        if (b.role && u.role !== b.role)
            throw E.forbidden('نوع الحساب المختار لا يطابق هذا الحساب. اختر نوع الحساب الصحيح ثم حاول مرة أخرى.', 'ROLE_MISMATCH');
        db.run('UPDATE users SET last_login_at = ? WHERE id = ?', iso(app.clock.now()), u.id);
        if (u.role === 'ADMIN')
            app.audit.log({ ctx, actor: { id: u.id, role: 'ADMIN' }, action: 'auth.admin_login', entityType: 'user', entityId: u.id });
        return { user: serializeUser(u), ...svc.issueSession(ctx, u) };
    });
    r.post('/auth/refresh', limit('refresh', { max: 60, windowMs: 60_000 }), (ctx) => {
        const fromCookie = svc.cookies(ctx.req.headers['cookie'])[svc.COOKIE];
        const token = ctx.body?.refreshToken || fromCookie;
        if (!token)
            throw E.unauthorized('لا توجد جلسة', 'NO_SESSION');
        if (!ctx.body?.refreshToken && ctx.req.headers['x-requested-with'] !== 'khadamat')
            throw E.forbidden('طلب غير موثوق', 'CSRF_CHECK_FAILED');
        const result = db.tx(() => {
            const row = db.get('SELECT * FROM refresh_tokens WHERE token_hash = ?', sha256(token));
            if (!row)
                return { error: E.unauthorized('جلسة غير صالحة', 'INVALID_SESSION') };
            if (row.revoked_at) {
                db.run('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE family_id = ?', iso(app.clock.now()), row.family_id);
                app.audit.log({ ctx, actor: { id: row.user_id, role: 'SYSTEM' }, action: 'auth.refresh_reuse_detected', entityType: 'user', entityId: row.user_id });
                return { error: E.unauthorized('جلسة غير صالحة', 'SESSION_REUSED') };
            }
            if (row.expires_at <= iso(app.clock.now()))
                return { error: E.unauthorized('انتهت الجلسة', 'SESSION_EXPIRED') };
            const u = svc.loadUser('u.id = ?', row.user_id);
            if (!u || u.status !== 'ACTIVE')
                return { error: E.unauthorized('حساب غير نشط', 'ACCOUNT_INACTIVE') };
            db.run('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?', iso(app.clock.now()), row.id);
            const session = svc.issueSession(ctx, u, row.family_id);
            return { ok: { user: serializeUser(u), ...session } };
        });
        if ('error' in result)
            throw result.error;
        return result.ok;
    });
    r.post('/auth/logout', (ctx) => {
        const token = ctx.body?.refreshToken || svc.cookies(ctx.req.headers['cookie'])[svc.COOKIE];
        if (token) {
            const row = db.get('SELECT family_id FROM refresh_tokens WHERE token_hash = ?', sha256(token));
            if (row)
                db.run('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE family_id = ?', iso(app.clock.now()), row.family_id);
        }
        svc.setCookie(ctx, '', 0);
        return { ok: true };
    });
    r.get('/auth/me', auth, (ctx) => {
        const u = svc.loadUser('u.id = ?', ctx.user.id);
        const out = { user: serializeUser(u) };
        if (u.role === 'PROVIDER')
            out.provider = app.providers.summary(ctx.user.providerId);
        return out;
    });
    r.post('/auth/change-password', auth, limit('chpw', { max: 5, windowMs: 15 * 60_000, key: (c) => c.user?.id || c.ip }), async (ctx) => {
        const b = parse(s.obj({ currentPassword: s.str({ min: 1, max: 128, trim: false }), newPassword: PASSWORD }), ctx.body);
        const u = svc.loadUser('u.id = ?', ctx.user.id);
        if (!(await verifyPassword(b.currentPassword, u.password_hash)))
            throw E.unauthorized('كلمة المرور الحالية غير صحيحة', 'INVALID_CREDENTIALS');
        const hash = await hashPassword(b.newPassword);
        return db.tx(() => {
            db.run('UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?', hash, iso(app.clock.now()), u.id);
            db.run('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?', iso(app.clock.now()), u.id);
            app.audit.log({ ctx, action: 'auth.change_password', entityType: 'user', entityId: u.id });
            return { ok: true, ...svc.issueSession(ctx, svc.loadUser('u.id = ?', u.id)) };
        });
    });
    r.post('/auth/change-email', auth, limit('chemail', { max: 5, windowMs: 15 * 60_000, key: (c) => c.user?.id || c.ip }), async (ctx) => {
        const b = parse(s.obj({
            currentPassword: s.str({ min: 1, max: 128, trim: false }),
            newEmail: s.str({ max: 160, lower: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, patternMessage: 'بريد إلكتروني غير صالح' }),
        }), ctx.body);
        const u = svc.loadUser('u.id = ?', ctx.user.id);
        if (!(await verifyPassword(b.currentPassword, u.password_hash)))
            throw E.unauthorized('كلمة المرور الحالية غير صحيحة', 'INVALID_CREDENTIALS');
        if (u.email === b.newEmail)
            throw E.conflict('هذا البريد هو البريد الحالي بالفعل', 'EMAIL_UNCHANGED');
        return db.tx(() => {
            const taken = db.get('SELECT id FROM users WHERE email = ? AND id != ?', b.newEmail, u.id);
            if (taken)
                throw E.conflict('البريد الإلكتروني مستخدم بالفعل', 'EMAIL_TAKEN');
            const now = iso(app.clock.now());
            db.run('UPDATE users SET email = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?', b.newEmail, now, u.id);
            db.run('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?', now, u.id);
            const fresh = svc.loadUser('u.id = ?', u.id);
            app.audit.log({ ctx, action: 'auth.change_email', entityType: 'user', entityId: u.id, before: { email: u.email }, after: { email: b.newEmail } });
            return { ok: true, user: serializeUser(fresh), ...svc.issueSession(ctx, fresh) };
        });
    });
}
//# sourceMappingURL=auth.js.map