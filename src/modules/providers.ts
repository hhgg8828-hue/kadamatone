import { s, parse, type Schema } from '../core/validate.js';
import { E } from '../core/errors.js';
import { uuid } from '../core/security.js';
import { iso, tr, round } from '../core/util.js';
import { auth, roles, adminLevel } from './auth.middleware.js';
import type { App } from '../app.js';
import type { Ctx, Router } from '../core/http.js';
import type { ServiceProviderRow, Locale, ProviderType, VerificationStatus } from '../types/domain.js';

const TIME: Schema = s.str({ pattern: /^([01]\d|2[0-3]):[0-5]\d$/, patternMessage: 'الوقت بصيغة HH:MM' });

export interface ProviderSummary {
  id: string; userId: string; fullName: string; displayName: string; providerType: ProviderType; bio: string | null; companyName: string | null; specialty: string | null;
  avatarUrl: string | null; verificationStatus: VerificationStatus; verified: boolean; rejectionReason: string | null; suspensionReason: string | null;
  isOnline: boolean; baseLocation: { lat: number; lng: number } | null; rating: { avg: number; count: number }; completedOrders: number;
  services: Array<{ serviceId: string; name: string; categoryName: string; customPrice: number | null; experienceYears: number }>;
  areas: Array<{ id: string; name: string }>; availability: Array<{ weekday: number; start: string; end: string }>; createdAt: string;
}
export interface ProviderPublicProfile {
  id: string; displayName: string; providerType: ProviderType; bio: string | null; companyName: string | null; specialty: string | null; avatarUrl: string | null;
  verified: boolean; rating: { avg: number; count: number }; completedOrders: number; isOnline: boolean;
  services: ProviderSummary['services']; areas: ProviderSummary['areas']; availability: ProviderSummary['availability'];
  workPhotos: (string | null)[]; recentReviews: Array<{ score: number; comment: string; createdAt: string; customerName: string }>;
}

export interface Providers {
  summary(providerId: string, locale?: Locale): ProviderSummary;
  documents(providerId: string): Array<{ id: string; docType: string; status: string; note: string | null; fileUrl: string | null; fileName: string | null; fileSize: number; createdAt: string }>;
  publicProfile(providerId: string, locale?: Locale): ProviderPublicProfile;
  earnings(providerId: string): { currency: string; commissionPercent: number; completedOrders: number; gross: number; commission: number; net: number; pendingValue: number; pendingOrders: number; byMonth: Array<{ month: string; orders: number; gross: number; net: number }>; note: string };
}

export function createProviders(app: App): Providers {
  const { db, catalog } = app;
  const fileUrl = (id: string | null): string | null => (id ? `/api/v1/files/${id}` : null);

  const svc: Providers = {
    summary(providerId, locale: Locale = 'ar') {
      const p = db.get<ServiceProviderRow & { full_name: string; avatar_file_id: string | null }>(`SELECT sp.*, u.full_name, u.avatar_file_id FROM service_providers sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`, providerId)!;
      const services = db.all<{ service_id: string; custom_price: number | null; experience_years: number }>('SELECT ps.* FROM provider_services ps WHERE ps.provider_id = ? AND ps.is_active = 1', providerId).map((ps) => {
        const x = catalog.all().byService.get(ps.service_id);
        return { serviceId: ps.service_id, name: x ? tr(x.name_i18n, locale) : '', categoryName: x ? tr(catalog.all().byCategory.get(x.category_id)?.name_i18n, locale) : '', customPrice: ps.custom_price, experienceYears: ps.experience_years };
      });
      const areas = db.all<{ area_id: string }>('SELECT area_id FROM provider_service_areas WHERE provider_id = ?', providerId).map((a) => {
        const ar = catalog.all().areas.find((x) => x.id === a.area_id);
        return { id: a.area_id, name: ar ? tr(ar.name_i18n, locale) : '' };
      });
      const availability = db.all<{ weekday: number; start_time: string; end_time: string }>('SELECT weekday, start_time, end_time FROM provider_availability WHERE provider_id = ? AND is_available = 1 ORDER BY weekday, start_time', providerId)
        .map((a) => ({ weekday: a.weekday, start: a.start_time, end: a.end_time }));
      return {
        id: p.id, userId: p.user_id, fullName: p.full_name, displayName: p.display_name, providerType: p.provider_type, bio: p.bio, companyName: p.company_name, specialty: p.specialty,
        avatarUrl: fileUrl(p.avatar_file_id), verificationStatus: p.verification_status, verified: p.verification_status === 'VERIFIED',
        rejectionReason: p.rejection_reason, suspensionReason: p.suspension_reason, isOnline: !!p.is_online,
        baseLocation: p.base_lat === null ? null : { lat: p.base_lat, lng: p.base_lng! },
        rating: { avg: round(p.rating_avg, 2), count: p.rating_count }, completedOrders: p.completed_orders_count, services, areas, availability, createdAt: p.created_at,
      };
    },
    documents(providerId) {
      return db.all<{ id: string; doc_type: string; status: string; note: string | null; file_id: string; original_name: string | null; size: number; created_at: string }>(`SELECT pd.*, f.original_name, f.size FROM provider_documents pd JOIN files f ON f.id = pd.file_id WHERE pd.provider_id = ? AND pd.doc_type <> 'PHOTO_WORK' ORDER BY pd.doc_type`, providerId)
        .map((d) => ({ id: d.id, docType: d.doc_type, status: d.status, note: d.note, fileUrl: fileUrl(d.file_id), fileName: d.original_name, fileSize: d.size, createdAt: d.created_at }));
    },
    publicProfile(providerId, locale: Locale = 'ar') {
      const base = svc.summary(providerId, locale);
      const works = db.all<{ file_id: string }>(`SELECT file_id FROM provider_documents WHERE provider_id = ? AND doc_type = 'PHOTO_WORK' ORDER BY created_at DESC LIMIT 12`, providerId).map((d) => fileUrl(d.file_id));
      const reviews = db.all<{ score: number; comment: string; created_at: string; full_name: string }>(
        `SELECT ra.score, rv.comment, rv.created_at, u.full_name FROM ratings ra
           JOIN reviews rv ON rv.rating_id = ra.id AND rv.status = 'VISIBLE' JOIN users u ON u.id = ra.customer_id
          WHERE ra.provider_id = ? ORDER BY rv.created_at DESC LIMIT 10`, providerId)
        .map((x) => ({ score: x.score, comment: x.comment, createdAt: x.created_at, customerName: String(x.full_name).split(' ')[0] ?? '' }));
      return { id: base.id, displayName: base.displayName, providerType: base.providerType, bio: base.bio, companyName: base.companyName, specialty: base.specialty, avatarUrl: base.avatarUrl,
        verified: base.verified, rating: base.rating, completedOrders: base.completedOrders, isOnline: base.isOnline, services: base.services, areas: base.areas, availability: base.availability, workPhotos: works, recentReviews: reviews };
    },
    earnings(providerId) {
      const commission = app.settings.get<number>('platform.commission_percent');
      const row = db.get<{ n: number; gross: number }>(`SELECT COUNT(*) n, COALESCE(SUM(agreed_price),0) gross FROM orders WHERE provider_id = ? AND status = 'COMPLETED'`, providerId)!;
      const pending = db.get<{ v: number; n: number }>(`SELECT COALESCE(SUM(agreed_price),0) v, COUNT(*) n FROM orders WHERE provider_id = ? AND status IN ('ACCEPTED','ON_THE_WAY','IN_PROGRESS')`, providerId)!;
      const byMonth = db.all<{ month: string; orders: number; gross: number }>(`SELECT substr(completed_at,1,7) month, COUNT(*) orders, COALESCE(SUM(agreed_price),0) gross FROM orders WHERE provider_id = ? AND status = 'COMPLETED' GROUP BY 1 ORDER BY 1 DESC LIMIT 12`, providerId)
        .map((m) => ({ month: m.month, orders: m.orders, gross: round(m.gross), net: round(m.gross * (1 - commission / 100)) }));
      return { currency: app.settings.get<string>('platform.currency'), commissionPercent: commission, completedOrders: row.n, gross: round(row.gross), commission: round(row.gross * commission / 100), net: round(row.gross * (1 - commission / 100)),
        pendingValue: round(pending.v), pendingOrders: pending.n, byMonth, note: 'الدفع نقدي مباشر بين العميل ومقدم الخدمة؛ الأرباح تقديرية وفق نسبة العمولة.' };
    },
  };
  return svc;
}

export function registerProviderRoutes(app: App, r: Router): void {
  const { db, catalog } = app;
  const isProvider = [auth, roles('PROVIDER')];
  const pid = (ctx: Ctx): string => {
    const direct = ctx.user!.providerId;
    if (direct) return direct;
    const row = db.get<{ id: string }>('SELECT id FROM service_providers WHERE user_id = ?', ctx.user!.id);
    if (!row) throw E.notFound('ملف مقدم الخدمة غير موجود', 'PROVIDER_NOT_FOUND');
    return row.id;
  };

  r.get('/provider/profile', ...isProvider, (ctx: Ctx) => ({ provider: app.providers.summary(pid(ctx), ctx.locale), documents: app.providers.documents(pid(ctx)) }));

  r.patch('/provider/profile', ...isProvider, (ctx: Ctx) => {
    const b = parse<{ displayName?: string; bio?: string; companyName?: string; specialty?: string; baseLocation?: { lat: number; lng: number } }>(s.obj({
      displayName: s.str({ min: 2, max: 80, optional: true }), bio: s.str({ max: 1000, optional: true }), companyName: s.str({ min: 2, max: 120, optional: true }), specialty: s.str({ max: 120, optional: true }),
      baseLocation: s.obj({ lat: s.num({ min: -90, max: 90 }), lng: s.num({ min: -180, max: 180 }) }, { optional: true }),
    }), ctx.body);
    db.run(`UPDATE service_providers SET display_name = COALESCE(?, display_name), bio = COALESCE(?, bio), company_name = COALESCE(?, company_name), specialty = COALESCE(?, specialty),
            base_lat = COALESCE(?, base_lat), base_lng = COALESCE(?, base_lng), updated_at = ? WHERE id = ?`,
      b.displayName ?? null, b.bio ?? null, b.companyName ?? null, b.specialty ?? null, b.baseLocation?.lat ?? null, b.baseLocation?.lng ?? null, iso(app.clock.now()), pid(ctx));
    return { provider: app.providers.summary(pid(ctx), ctx.locale) };
  });

  r.post('/provider/documents', ...isProvider, (ctx: Ctx) => {
    const b = parse<{ docType: 'ID' | 'LICENSE' | 'COMMERCIAL_REG' | 'CERTIFICATE' | 'PHOTO_WORK'; fileId: string }>(s.obj({ docType: s.oneOf(['ID', 'LICENSE', 'COMMERCIAL_REG', 'CERTIFICATE', 'PHOTO_WORK']), fileId: s.str({ min: 8, max: 64 }) }), ctx.body);
    const purpose = b.docType === 'PHOTO_WORK' ? 'work_photo' : 'provider_document';
    return db.tx(() => {
      if (!db.get('SELECT 1 FROM files WHERE id = ? AND owner_id = ? AND purpose = ?', b.fileId, ctx.user!.id, purpose)) throw E.unprocessable('الملف غير صالح لهذا النوع', 'INVALID_FILE');
      const now = iso(app.clock.now());
      const existing = db.get<{ id: string; file_id: string; status: string }>(
        `SELECT id, file_id, status FROM provider_documents WHERE provider_id = ? AND doc_type = ? ORDER BY created_at DESC LIMIT 1`,
        pid(ctx), b.docType
      );
      if (b.docType !== 'PHOTO_WORK' && existing) {
        db.run(`UPDATE provider_documents SET file_id = ?, status = 'PENDING', reviewed_by = NULL, reviewed_at = NULL, note = NULL, created_at = ? WHERE id = ?`,
          b.fileId, now, existing.id);
        if (existing.file_id !== b.fileId) { app.storage.remove(existing.file_id); db.run('DELETE FROM files WHERE id = ?', existing.file_id); }
      } else {
        const id = uuid();
        db.run('INSERT INTO provider_documents(id,provider_id,doc_type,file_id,status,created_at) VALUES (?,?,?,?,?,?)', id, pid(ctx), b.docType, b.fileId, b.docType === 'PHOTO_WORK' ? 'APPROVED' : 'PENDING', now);
      }
      const p = db.get<{ verification_status: VerificationStatus; display_name: string }>('SELECT verification_status, display_name FROM service_providers WHERE id = ?', pid(ctx))!;
      if (b.docType !== 'PHOTO_WORK') {
        db.run(`UPDATE service_providers SET verification_status = 'PENDING', rejection_reason = NULL, updated_at = ? WHERE id = ?`, now, pid(ctx));
        if (p.verification_status !== 'PENDING') app.notifications.notifyAdmins('PROVIDER_PENDING_ADMIN', { provider: p.display_name }, { providerId: pid(ctx) });
      }
      ctx.status = existing && b.docType !== 'PHOTO_WORK' ? 200 : 201;
      return { documents: app.providers.documents(pid(ctx)) };
    });
  });

  r.delete('/provider/documents/:id', ...isProvider, (ctx: Ctx) => {
    const d = db.get<{ id: string; doc_type: string; status: string }>('SELECT * FROM provider_documents WHERE id = ? AND provider_id = ?', ctx.params['id'], pid(ctx));
    if (!d) throw E.notFound();
    if (d.doc_type !== 'PHOTO_WORK' && d.status === 'APPROVED') throw E.unprocessable('لا يمكن حذف مستند معتمد', 'DOCUMENT_LOCKED');
    db.run('DELETE FROM provider_documents WHERE id = ?', d.id);
    return undefined;
  });

  r.put('/provider/services', ...isProvider, (ctx: Ctx) => {
    const b = parse<{ services: Array<{ serviceId: string; customPrice?: number; experienceYears: number }> }>(s.obj({ services: s.arr(s.obj({ serviceId: s.str({ max: 64 }), customPrice: s.num({ min: 0, max: 1e9, optional: true }), experienceYears: s.int({ min: 0, max: 60, optional: true, default: 0 }) }), { max: 60 }) }), ctx.body);
    return db.tx(() => {
      for (const x of b.services) if (!catalog.getActiveService(x.serviceId)) throw E.unprocessable('خدمة غير صالحة', 'INVALID_SERVICE', [{ path: 'services', message: x.serviceId }]);
      db.run('DELETE FROM provider_services WHERE provider_id = ?', pid(ctx));
      for (const x of new Map(b.services.map((y) => [y.serviceId, y])).values())
        db.run('INSERT INTO provider_services(provider_id,service_id,custom_price,experience_years) VALUES (?,?,?,?)', pid(ctx), x.serviceId, x.customPrice ?? null, x.experienceYears ?? 0);
      const out = { provider: app.providers.summary(pid(ctx), ctx.locale) }; app.sse.send(ctx.user!.id, 'sync', { scope: 'provider' }); return out;
    });
  });

  r.put('/provider/areas', ...isProvider, (ctx: Ctx) => {
    const b = parse<{ areaIds: string[] }>(s.obj({ areaIds: s.arr(s.str({ max: 64 }), { max: 100 }) }), ctx.body);
    return db.tx(() => {
      const valid = new Set(catalog.all().areas.filter((a) => a.is_active).map((a) => a.id));
      for (const id of b.areaIds) if (!valid.has(id)) throw E.unprocessable('منطقة غير صالحة', 'INVALID_AREA');
      db.run('DELETE FROM provider_service_areas WHERE provider_id = ?', pid(ctx));
      for (const id of new Set(b.areaIds)) db.run('INSERT INTO provider_service_areas(provider_id,area_id) VALUES (?,?)', pid(ctx), id);
      return { provider: app.providers.summary(pid(ctx), ctx.locale) };
    });
  });

  r.put('/provider/availability', ...isProvider, (ctx: Ctx) => {
    const b = parse<{ slots: Array<{ weekday: number; start: string; end: string }> }>(s.obj({ slots: s.arr(s.obj({ weekday: s.int({ min: 0, max: 6 }), start: TIME, end: TIME }), { max: 50 }) }), ctx.body);
    for (const x of b.slots) if (x.start >= x.end) throw E.unprocessable('وقت النهاية يجب أن يكون بعد البداية', 'INVALID_SLOT');
    return db.tx(() => {
      db.run('DELETE FROM provider_availability WHERE provider_id = ?', pid(ctx));
      for (const x of b.slots) db.run('INSERT INTO provider_availability(id,provider_id,weekday,start_time,end_time) VALUES (?,?,?,?,?)', uuid(), pid(ctx), x.weekday, x.start, x.end);
      return { provider: app.providers.summary(pid(ctx), ctx.locale) };
    });
  });

  r.post('/provider/online', ...isProvider, (ctx: Ctx) => {
    const { online } = parse<{ online: boolean }>(s.obj({ online: s.bool() }), ctx.body);
    const p = db.get<{ verification_status: VerificationStatus; base_lat: number | null; base_lng: number | null }>('SELECT verification_status, base_lat, base_lng FROM service_providers WHERE id = ?', pid(ctx))!;
    if (online && p.verification_status !== 'VERIFIED') throw E.forbidden('لا يمكنك استقبال الطلبات قبل توثيق حسابك', 'PROVIDER_NOT_VERIFIED');
    if (online && (p.base_lat === null || p.base_lng === null)) throw E.unprocessable('حدد موقعك الأساسي قبل بدء استقبال الطلبات', 'PROVIDER_LOCATION_REQUIRED');
    const serviceCount = db.get<{ count: number }>('SELECT COUNT(*) AS count FROM provider_services WHERE provider_id = ? AND is_active = 1', pid(ctx))?.count ?? 0;
    if (online && serviceCount < 1) throw E.unprocessable('اختر خدمة واحدة على الأقل قبل بدء استقبال الطلبات', 'PROVIDER_SERVICES_REQUIRED');
    db.run('UPDATE service_providers SET is_online = ?, updated_at = ? WHERE id = ?', online ? 1 : 0, iso(app.clock.now()), pid(ctx));
    app.sse.send(ctx.user!.id, 'sync', { scope: 'provider' }); return { isOnline: online };
  });


  // إدارة توثيق مقدمي الخدمات من لوحة الإدارة
  r.get('/admin/providers', auth, adminLevel('SUPPORT'), (ctx: Ctx) => {
    const status = ctx.query['status'];
    const rows = db.all<any>(`SELECT sp.*, u.full_name, u.phone, u.email FROM service_providers sp JOIN users u ON u.id = sp.user_id ${status ? 'WHERE sp.verification_status = ?' : ''} ORDER BY sp.created_at DESC LIMIT 200`, ...(status ? [status] : []));
    return { providers: rows.map((p) => ({ id: p.id, userId: p.user_id, fullName: p.full_name, phone: p.phone, email: p.email, displayName: p.display_name, providerType: p.provider_type, verificationStatus: p.verification_status, rejectionReason: p.rejection_reason, suspensionReason: p.suspension_reason, isOnline: !!p.is_online, rating: p.rating_avg, completedOrders: p.completed_orders_count, createdAt: p.created_at, documents: app.providers.documents(p.id) })) };
  });

  r.patch('/admin/providers/:id/verification', auth, adminLevel('ADMIN'), (ctx: Ctx) => {
    const b = parse<{ status: 'VERIFIED' | 'REJECTED' | 'SUSPENDED'; reason?: string }>(s.obj({ status: s.oneOf(['VERIFIED','REJECTED','SUSPENDED']), reason: s.str({ max: 500, optional: true }) }), ctx.body);
    return db.tx(() => {
      const p = db.get<any>('SELECT * FROM service_providers WHERE id = ?', ctx.params['id']);
      if (!p) throw E.notFound('مقدم الخدمة غير موجود');
      const docs = db.all<{ doc_type: string; status: string }>(`SELECT doc_type, status FROM provider_documents WHERE provider_id = ? AND doc_type IN ('ID','LICENSE')`, p.id);
      const hasId = docs.some((d) => d.doc_type === 'ID');
      const hasLicense = docs.some((d) => d.doc_type === 'LICENSE');
      if (b.status === 'VERIFIED' && (!hasId || !hasLicense)) throw E.unprocessable('لا يمكن توثيق الحساب قبل رفع الهوية والترخيص', 'DOCUMENTS_REQUIRED');
      const now = iso(app.clock.now());
      const verifiedAt = b.status === 'VERIFIED' ? now : null;
      db.run(`UPDATE service_providers SET verification_status=?, rejection_reason=?, suspension_reason=?, verified_at=?, updated_at=? WHERE id=?`, b.status, b.status === 'REJECTED' ? (b.reason || null) : null, b.status === 'SUSPENDED' ? (b.reason || null) : null, verifiedAt, now, p.id);
      if (b.status === 'VERIFIED') {
        db.run(`UPDATE provider_documents SET status='APPROVED', reviewed_by=?, reviewed_at=?, note=NULL WHERE provider_id=? AND doc_type IN ('ID','LICENSE')`, ctx.user!.id, now, p.id);
      } else {
        db.run(`UPDATE provider_documents SET status='REJECTED', reviewed_by=?, reviewed_at=?, note=? WHERE provider_id=? AND doc_type IN ('ID','LICENSE')`, ctx.user!.id, now, b.reason || 'راجع الوثائق المرفوعة', p.id);
        db.run(`UPDATE service_providers SET is_online=0 WHERE id=?`, p.id);
      }
      const type = b.status === 'VERIFIED' ? 'PROVIDER_VERIFIED' : b.status === 'REJECTED' ? 'PROVIDER_REJECTED' : 'PROVIDER_SUSPENDED';
      app.notifications.notify(p.user_id, type, { reason: b.reason || '' });
      app.audit.log({ ctx, action: 'provider.verification_update', entityType: 'service_provider', entityId: p.id, before: { status: p.verification_status }, after: { status: b.status, reason: b.reason || null } });
      return { provider: app.providers.summary(p.id, ctx.locale) };
    });
  });

  r.get('/provider/earnings', ...isProvider, (ctx: Ctx) => app.providers.earnings(pid(ctx)));

  r.get('/providers/:id', (ctx: Ctx) => {
    const p = db.get<{ id: string; user_id: string; verification_status: VerificationStatus }>('SELECT id, user_id, verification_status FROM service_providers WHERE id = ?', ctx.params['id']);
    if (!p) throw E.notFound('مقدم الخدمة غير موجود');
    if (p.verification_status !== 'VERIFIED') {
      let allowed = false;
      try { auth(ctx); allowed = ctx.user!.role === 'ADMIN' || ctx.user!.id === p.user_id; } catch { /* غير مسجل */ }
      if (!allowed) throw E.notFound('مقدم الخدمة غير موجود');
    }
    return { provider: app.providers.publicProfile(p.id, ctx.locale) };
  });
}
