import { s, parse, normalizePhone, PHONE_RE } from '../core/validate.js';
import { E } from '../core/errors.js';
import { hashPassword, uuid } from '../core/security.js';
import { iso, pageParams, cursorSql, finishPage, parseJson } from '../core/util.js';
import { auth, adminLevel } from './auth.middleware.js';
import { serializeUser } from './auth.js';
import type { App } from '../app.js';
import type { Ctx, Router } from '../core/http.js';
import type { UserRow } from '../types/domain.js';

/** إدارة المستخدمين والمديرين وسجل التدقيق (الأساس الذي تبنى عليه لوحة الإدارة). */
export function registerAdminCoreRoutes(app: App, r: Router): void {
  const { db } = app;

  r.get('/admin/dashboard', auth, adminLevel('SUPPORT'), () => {
    const count = (sql: string, ...params: unknown[]) => Number(db.get<{ n: number }>(sql, ...params)?.n || 0);
    return { stats: {
      users: count('SELECT COUNT(*) n FROM users'),
      providers: count('SELECT COUNT(*) n FROM service_providers'),
      pendingProviders: count("SELECT COUNT(*) n FROM service_providers WHERE verification_status='PENDING'"),
      orders: count('SELECT COUNT(*) n FROM orders'),
      activeOrders: count("SELECT COUNT(*) n FROM orders WHERE status IN ('PENDING','SEARCHING','ASSIGNED','ACCEPTED','ON_THE_WAY','IN_PROGRESS')"),
      completedOrders: count("SELECT COUNT(*) n FROM orders WHERE status='COMPLETED'"),
      cancelledOrders: count("SELECT COUNT(*) n FROM orders WHERE status='CANCELLED'"),
      complaints: count("SELECT COUNT(*) n FROM complaints WHERE status NOT IN ('RESOLVED','REJECTED','CLOSED')")
    }};
  });

  r.get('/admin/users', auth, adminLevel('SUPPORT'), (ctx: Ctx) => {
    const { limit, cursor } = pageParams(ctx.query);
    const c = cursorSql('u', cursor);
    const where: string[] = []; const params: unknown[] = [];
    if (ctx.query['role']) { where.push('r.code = ?'); params.push(String(ctx.query['role'])); }
    if (ctx.query['status']) { where.push('u.status = ?'); params.push(String(ctx.query['status'])); }
    if (ctx.query['q']) { where.push('(u.full_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)'); const q = `%${String(ctx.query['q']).slice(0, 60)}%`; params.push(q, q, q); }
    const rows = db.all<UserRow>(`SELECT u.*, r.code AS role, au.admin_level FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN admin_users au ON au.user_id = u.id
                         WHERE 1=1 ${where.map((w) => 'AND ' + w).join(' ')}${c.sql} ORDER BY u.created_at DESC, u.id DESC LIMIT ?`, ...params, ...c.params, limit + 1);
    const { items, nextCursor } = finishPage(rows, limit);
    return { users: items.map((u) => ({ ...serializeUser(u), createdAt: u.created_at, lastLoginAt: u.last_login_at })), nextCursor };
  });

  r.patch('/admin/users/:id/status', auth, adminLevel('ADMIN'), (ctx: Ctx) => {
    const b = parse<{ status: 'ACTIVE' | 'SUSPENDED'; reason?: string }>(s.obj({ status: s.oneOf(['ACTIVE', 'SUSPENDED']), reason: s.str({ max: 300, optional: true }) }), ctx.body);
    return db.tx(() => {
      const u = app.authService.loadUser('u.id = ?', ctx.params['id']);
      if (!u) throw E.notFound('المستخدم غير موجود');
      if (u.id === ctx.user!.id) throw E.unprocessable('لا يمكنك تغيير حالة حسابك', 'SELF_ACTION');
      if (u.role === 'ADMIN' && ctx.user!.adminLevel !== 'SUPER_ADMIN') throw E.forbidden('تعليق المديرين يتطلب مدير أعلى', 'INSUFFICIENT_ADMIN_LEVEL');
      db.run('UPDATE users SET status = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?', b.status, iso(app.clock.now()), u.id);
      if (b.status === 'SUSPENDED') db.run('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?', iso(app.clock.now()), u.id);
      app.audit.log({ ctx, action: b.status === 'SUSPENDED' ? 'user.suspend' : 'user.activate', entityType: 'user', entityId: u.id, before: { status: u.status }, after: { status: b.status, reason: b.reason || null } });
      return { user: serializeUser({ ...u, status: b.status }) };
    });
  });

  r.post('/admin/admins', auth, adminLevel('SUPER_ADMIN'), async (ctx: Ctx) => {
    const b = parse<{ fullName: string; phone: string; email: string; password: string; adminLevel: 'ADMIN' | 'SUPPORT' }>(s.obj({
      fullName: s.str({ min: 2, max: 80 }), phone: s.str({ min: 8, max: 24 }),
      email: s.str({ max: 160, lower: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, patternMessage: 'بريد إلكتروني غير صالح' }),
      password: s.str({ min: 10, max: 128, trim: false, pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, patternMessage: 'يجب أن تحتوي كلمة المرور على حرف ورقم' }),
      adminLevel: s.oneOf(['ADMIN', 'SUPPORT']),
    }), ctx.body);
    const phone = normalizePhone(b.phone);
    if (!PHONE_RE.test(phone)) throw E.unprocessable('رقم هاتف غير صالح', 'VALIDATION_ERROR', [{ path: 'phone', message: 'رقم هاتف غير صالح' }]);
    const hash = await hashPassword(b.password);
    return db.tx(() => {
      if (db.get('SELECT 1 FROM users WHERE phone = ? OR email = ?', phone, b.email)) throw E.conflict('الهاتف أو البريد مسجل مسبقًا', 'USER_EXISTS');
      const id = uuid(), now = iso(app.clock.now());
      db.run('INSERT INTO users(id,role_id,full_name,phone,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', id, 3, b.fullName, phone, b.email, hash, now, now);
      db.run('INSERT INTO admin_users(user_id, admin_level, created_by) VALUES (?,?,?)', id, b.adminLevel, ctx.user!.id);
      app.audit.log({ ctx, action: 'admin.create', entityType: 'user', entityId: id, after: { adminLevel: b.adminLevel, email: b.email } });
      ctx.status = 201;
      return { user: serializeUser(app.authService.loadUser('u.id = ?', id)) };
    });
  });

  r.get('/admin/audit-logs', auth, adminLevel('ADMIN'), (ctx: Ctx) => {
    const limit = Math.min(Number.parseInt(ctx.query['limit'] ?? '', 10) || 50, 200);
    const where: string[] = []; const params: unknown[] = [];
    if (ctx.query['entityType']) { where.push('entity_type = ?'); params.push(String(ctx.query['entityType'])); }
    if (ctx.query['entityId']) { where.push('entity_id = ?'); params.push(String(ctx.query['entityId'])); }
    if (ctx.query['action']) { where.push('action = ?'); params.push(String(ctx.query['action'])); }
    if (ctx.query['before']) { where.push('id < ?'); params.push(Number(ctx.query['before']) || 0); }
    const rows = db.all<{ id: number; actor_id: string | null; actor_role: string; action: string; entity_type: string | null; entity_id: string | null; before: string | null; after: string | null; ip: string | null; created_at: string }>(
      `SELECT * FROM audit_logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`, ...params, limit);
    return { logs: rows.map((l) => ({ id: l.id, actorId: l.actor_id, actorRole: l.actor_role, action: l.action, entityType: l.entity_type, entityId: l.entity_id, before: parseJson(l.before), after: parseJson(l.after), ip: l.ip, createdAt: l.created_at })),
      nextBefore: rows.length === limit ? rows[rows.length - 1]!.id : null };
  });
}
