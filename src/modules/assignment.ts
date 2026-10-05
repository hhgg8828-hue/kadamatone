import { s, parse } from '../core/validate.js';
import { E } from '../core/errors.js';
import { uuid } from '../core/security.js';
import { iso, tr } from '../core/util.js';
import { auth, roles } from './auth.middleware.js';
import { canTransition, PROVIDER_STEPS } from '../../shared/orderStateMachine.js';
import type { App } from '../app.js';
import type { Ctx, Router } from '../core/http.js';
import type { OrderRow, OrderAssignmentRow, OrderStatus } from '../types/domain.js';
import { executionEvent } from './execution.js';

export interface AssignmentService {
  assignWave(orderId: string): { offered: number };
  reassignAfterProviderCancellation(orderId: string, providerId: string, reason?: string): { offered: number };
  acceptOffer(assignmentId: string, ctx: Ctx): OrderRow;
  rejectOffer(assignmentId: string, ctx: Ctx): void;
  listOffers(providerId: string): Array<OrderAssignmentRow & { orderCode: string; serviceName: string; areaName: string; priority: string }>;
  tick(): { expired: number; waved: number; exhausted: number };
}

export function createAssignmentService(app: App): AssignmentService {
  const { db, catalog } = app;
  const notifiedExhausted = new Set<string>(); // إزالة تكرار إشعار «لم نجد مقدم خدمة» لكل طلب — حالة عملية واحدة (تُعاد عند إعادة الإسناد يدويًا)

  const svc: AssignmentService = {
    assignWave(orderId) {
      return db.tx(() => {
        const o = db.get<OrderRow>('SELECT * FROM orders WHERE id = ?', orderId)!;
        if (!['SEARCHING', 'ASSIGNED'].includes(o.status) || o.provider_id) return { offered: 0 };
        const excludeProviderIds = db.all<{ provider_id: string }>("SELECT DISTINCT provider_id FROM order_assignments WHERE order_id = ? AND status IN ('REJECTED','EXPIRED','ACCEPTED')", orderId).map((x) => x.provider_id);
        // نرسل العرض إلى الأقرب فقط؛ عند الرفض/انتهاء المهلة ينتقل إلى التالي الأقرب.
        const batch = o.pricing_type === 'QUOTE' ? app.settings.get<number>('assignment.batch_size') : 1;
        const candidates = app.matcher.findCandidates(o, { excludeProviderIds, limit: batch });
        if (!candidates.length) return { offered: 0 };
        const wave = o.wave + 1;
        const ttlMs = app.settings.get<number>('assignment.offer_ttl_sec') * 1000;
        const now = app.clock.now(); const nowIso = iso(now); const expiresAt = iso(now + ttlMs);
        for (const c of candidates) {
          const existing = db.get<{id:string}>('SELECT id FROM order_assignments WHERE order_id=? AND provider_id=?', o.id, c.providerId);
          if (existing) db.run("UPDATE order_assignments SET status='OFFERED',wave=?,score=?,distance_km=?,offered_at=?,expires_at=?,responded_at=NULL,decision_reason=NULL WHERE id=?", wave, c.score, c.distanceKm, nowIso, expiresAt, existing.id);
          else db.run('INSERT INTO order_assignments(id,order_id,provider_id,status,wave,score,distance_km,offered_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
            uuid(), o.id, c.providerId, 'OFFERED', wave, c.score, c.distanceKm, nowIso, expiresAt);
        }
        const wasSearching = o.status === 'SEARCHING';
        db.run('UPDATE orders SET status=?, wave=?, search_exhausted_at=NULL, updated_at=?, version=version+1 WHERE id=? AND version=?', 'ASSIGNED', wave, nowIso, o.id, o.version);
        if (wasSearching) db.run('INSERT INTO order_status_history(order_id,from_status,to_status,changed_by,actor_role,reason,created_at) VALUES (?,?,?,?,?,?,?)', o.id, 'SEARCHING', 'ASSIGNED', null, 'SYSTEM', `wave ${wave}`, nowIso);
        const svcRow = catalog.all().byService.get(o.service_id)!;
        const areaRow = catalog.all().areas.find((a) => a.id === o.area_id);
        for (const c of candidates) {
          const p = db.get<{ user_id: string }>('SELECT user_id FROM service_providers WHERE id = ?', c.providerId)!;
          app.notifications.notify(p.user_id, 'NEW_OFFER', { service: tr(svcRow.name_i18n, 'ar'), area: areaRow ? tr(areaRow.name_i18n, 'ar') : '' }, { orderId: o.id, assignmentId: db.get<any>('SELECT id FROM order_assignments WHERE order_id=? AND provider_id=?',o.id,c.providerId)?.id || null });
          app.sse.broadcast('sync', {scope:'admin',entity:'assignment',orderId:o.id,providerId:c.providerId});
        }
        notifiedExhausted.delete(o.id);
        return { offered: candidates.length };
      });
    },

    reassignAfterProviderCancellation(orderId, providerId, reason = 'provider_cancelled') {
      const result = db.tx(() => {
        const o = db.get<OrderRow>('SELECT * FROM orders WHERE id=?', orderId);
        if (!o || o.provider_id !== providerId || !['ACCEPTED'].includes(o.status)) return { offered: 0 };
        const nowIso = iso(app.clock.now());
        db.run(`UPDATE order_assignments SET status='WITHDRAWN', responded_at=?, decision_reason='انتقل العرض لمقدم خدمة آخر' WHERE order_id=? AND status='OFFERED'`, nowIso, orderId);
        db.run(`UPDATE order_assignments SET status='REJECTED', responded_at=?, decision_reason='رفض مقدم الخدمة' WHERE order_id=? AND provider_id=? AND status='ACCEPTED'`, nowIso, orderId, providerId);
        db.run(`UPDATE orders SET status='SEARCHING', provider_id=NULL, accepted_at=NULL, agreed_price=NULL, search_exhausted_at=NULL, wave=0, updated_at=?, version=version+1 WHERE id=? AND provider_id=? AND status='ACCEPTED'`, nowIso, orderId, providerId);
        db.run('INSERT INTO order_status_history(order_id,from_status,to_status,changed_by,actor_role,reason,created_at) VALUES (?,?,?,?,?,?,?)', orderId, 'ACCEPTED', 'SEARCHING', null, 'SYSTEM', reason, nowIso);
        app.notifications.notify(o.customer_id, 'PROVIDER_REASSIGNED', { code: o.code });
        const p = db.get<{user_id:string}>('SELECT user_id FROM service_providers WHERE id=?', providerId);
        if (p) app.notifications.notify(p.user_id, 'ORDER_REASSIGNED', { code: o.code }, { orderId });
        return { offered: 0 };
      });
      const r = svc.assignWave(orderId);
      return r.offered ? r : result;
    },

    acceptOffer(assignmentId, ctx) {
      const providerId = ctx.user!.providerId!;
      return db.tx(() => {
        const a = db.get<OrderAssignmentRow>('SELECT * FROM order_assignments WHERE id = ? AND provider_id = ?', assignmentId, providerId);
        if (!a) throw E.notFound('العرض غير موجود');
        // Idempotency: if the same provider already accepted this offer, return the accepted order
        // instead of showing a false error after a duplicate/concurrent request.
        if (a.status === 'ACCEPTED') {
          const already = db.get<OrderRow>("SELECT * FROM orders WHERE id = ? AND provider_id = ? AND status = 'ACCEPTED'", a.order_id, providerId);
          if (already) return already;
          throw E.conflict('هذا العرض لم يعد متاحًا', 'OFFER_NOT_AVAILABLE');
        }
        if (a.status !== 'OFFERED') throw E.conflict('هذا العرض لم يعد متاحًا', 'OFFER_NOT_AVAILABLE');
        const now = app.clock.now(); const nowIso = iso(now);
        if (Date.parse(a.expires_at) <= now) { db.run(`UPDATE order_assignments SET status='EXPIRED', responded_at=?, decision_reason='انتهت مهلة الاستجابة' WHERE id=?`, nowIso, a.id); throw E.conflict('انتهت مهلة هذا العرض', 'OFFER_EXPIRED'); }
        const o = db.get<OrderRow>('SELECT * FROM orders WHERE id = ?', a.order_id)!;
        const trip = db.get<{service_slug:string}>('SELECT s.slug service_slug FROM services s WHERE s.id=?', o.service_id);
        if (trip?.service_slug === 'motorcycle-trips' && !db.get('SELECT 1 FROM provider_vehicles WHERE provider_id=? AND status=\'VERIFIED\' AND is_active=1', providerId)) {
          throw E.forbidden('لا يمكن قبول مشوار بالدباب قبل اعتماد مركبة صالحة', 'VERIFIED_VEHICLE_REQUIRED');
        }
        const existingQuote = db.get<{ status: string }>(`SELECT status FROM quotes WHERE order_id=? AND provider_id=? ORDER BY created_at DESC LIMIT 1`, o.id, providerId);
        if (existingQuote?.status === 'SUBMITTED') throw E.conflict('تم تقديم عرض سعر لهذا الطلب بالفعل، اختر قرار العميل على العرض.', 'QUOTE_ALREADY_SUBMITTED');
        const res = db.run(`UPDATE orders SET status='ACCEPTED', provider_id=?, agreed_price=price_snapshot, accepted_at=?, search_exhausted_at=NULL, updated_at=?, version=version+1
                             WHERE id=? AND status IN ('SEARCHING','ASSIGNED') AND provider_id IS NULL`, providerId, nowIso, nowIso, o.id);
        if (!res.changes) { db.run(`UPDATE order_assignments SET status='EXPIRED', responded_at=?, decision_reason='انتهت مهلة الاستجابة' WHERE id=?`, nowIso, a.id); throw E.conflict('سبقك مقدم خدمة آخر إلى هذا الطلب', 'ORDER_ALREADY_TAKEN'); }
        db.run(`UPDATE order_assignments SET status='ACCEPTED', responded_at=?, decision_reason='تم قبول العرض' WHERE id=?`, nowIso, a.id);
        db.run("UPDATE intent_audit SET selected_provider_id=?,assignment_result='ACCEPTED',updated_at=? WHERE order_id=?",providerId,nowIso,o.id);
        db.run(`UPDATE order_assignments SET status='WITHDRAWN', responded_at=?, decision_reason='انتقل العرض لمقدم خدمة آخر' WHERE order_id=? AND status='OFFERED' AND id != ?`, nowIso, o.id, a.id);
        db.run('INSERT INTO order_status_history(order_id,from_status,to_status,changed_by,actor_role,created_at) VALUES (?,?,?,?,?,?)', o.id, o.status, 'ACCEPTED', ctx.user!.id, 'PROVIDER', nowIso);
        app.payment.onAccepted(db.get<OrderRow>('SELECT * FROM orders WHERE id = ?', o.id)!);
        const p = app.providers.summary(providerId);
        app.notifications.notify(o.customer_id, 'ORDER_ACCEPTED', { code: o.code, provider: p.displayName }, { orderId: o.id });
        executionEvent(app,o.id,'ASSIGNED_PROVIDER','تم قبول الطلب من مقدم الخدمة',p.displayName,'PROVIDER',ctx.user!.id,{providerId});
        app.sse.broadcast('sync',{scope:'admin',entity:'order',orderId:o.id,event:'accepted',providerId});
        return db.get<OrderRow>('SELECT * FROM orders WHERE id = ?', o.id)!;
      });
    },

    rejectOffer(assignmentId, ctx) {
      const providerId = ctx.user!.providerId!;
      const now = iso(app.clock.now());
      const res = db.run(`UPDATE order_assignments SET status='REJECTED', responded_at=?, decision_reason='رفض مقدم الخدمة' WHERE id=? AND provider_id=? AND status='OFFERED'`, now, assignmentId, providerId);
      if (!res.changes) throw E.notFound('العرض غير موجود');
      const assignment = db.get<{ order_id: string }>('SELECT order_id FROM order_assignments WHERE id = ?', assignmentId);
      if (assignment) { db.run("UPDATE intent_audit SET assignment_result='REJECTED',updated_at=? WHERE order_id=? AND (assignment_result IS NULL OR assignment_result<>'ACCEPTED')",now,assignment.order_id); svc.assignWave(assignment.order_id); }
    },

    listOffers(providerId) {
      const now = iso(app.clock.now());
      return db.all<OrderAssignmentRow & { code: string; service_id: string; area_id: string; priority: string }>(
        `SELECT a.*, o.code, o.service_id, o.area_id, o.priority FROM order_assignments a JOIN orders o ON o.id = a.order_id
          WHERE a.provider_id = ? AND a.status = 'OFFERED' AND a.expires_at > ? ORDER BY a.offered_at`, providerId, now)
        .map((a) => {
          const svcRow = catalog.all().byService.get(a.service_id);
          const areaRow = catalog.all().areas.find((x) => x.id === a.area_id);
          return { ...a, orderCode: a.code, serviceName: svcRow ? tr(svcRow.name_i18n, 'ar') : '', areaName: areaRow ? tr(areaRow.name_i18n, 'ar') : '', priority: a.priority };
        });
    },

    tick() {
      const now = app.clock.now(); const nowIso = iso(now);
      const expired = Number(db.run(`UPDATE order_assignments SET status='EXPIRED', responded_at=?, decision_reason='انتهت مهلة الاستجابة' WHERE status='OFFERED' AND expires_at <= ?`, nowIso, nowIso).changes);
      db.run("UPDATE intent_audit SET assignment_result='EXPIRED',updated_at=? WHERE order_id IN (SELECT order_id FROM order_assignments WHERE status='EXPIRED' AND responded_at=?) AND (assignment_result IS NULL OR assignment_result<>'ACCEPTED')",nowIso,nowIso);
      const stuck = db.all<{ id: string; wave: number; search_exhausted_at: string | null }>(
        `SELECT o.id, o.wave, o.search_exhausted_at FROM orders o WHERE o.status IN ('SEARCHING','ASSIGNED') AND o.provider_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM order_assignments a WHERE a.order_id = o.id AND a.status = 'OFFERED')`);
      let waved = 0, exhausted = 0;
      const maxWaves = app.settings.get<number>('assignment.max_waves');
      const retryMs = app.settings.get<number>('assignment.search_retry_minutes') * 60_000;
      for (const o of stuck) {
        if (o.wave < maxWaves && !o.search_exhausted_at) {
          const r = svc.assignWave(o.id);
          if (r.offered > 0) { waved++; continue; }
        }
        if (!o.search_exhausted_at) {
          const full = db.get<OrderRow>('SELECT * FROM orders WHERE id = ?', o.id)!;
          const stamp = iso(app.clock.now());
          db.run("UPDATE orders SET status='SEARCHING', search_exhausted_at=?, updated_at=?, version=version+1 WHERE id=?", stamp, stamp, o.id);
          app.notifications.notify(full.customer_id, 'NO_PROVIDER_FOUND', { code: full.code });
          app.notifications.notifyAdmins('NO_PROVIDER_FOUND_ADMIN', { code: full.code });
          notifiedExhausted.add(o.id);
          exhausted++;
          continue;
        }
        if (Date.parse(o.search_exhausted_at) + retryMs <= now) {
          const full = db.get<OrderRow>('SELECT * FROM orders WHERE id = ?', o.id)!;
          db.run('UPDATE orders SET wave=0, search_exhausted_at=NULL, updated_at=?, version=version+1 WHERE id=?', nowIso, o.id);
          const r = svc.assignWave(o.id);
          if (r.offered > 0) { waved++; app.notifications.notify(full.customer_id, 'SEARCH_RETRY', { code: full.code }, { orderId: full.id }); }
        }
      }
      return { expired, waved, exhausted };
    },
  };
  return svc;
}

export function registerAssignmentRoutes(app: App, r: Router): void {
  const { db, orders } = app;
  const isProvider = [auth, roles('PROVIDER')];

  r.get('/provider/offers', ...isProvider, (ctx: Ctx) => ({
    offers: app.assignment.listOffers(ctx.user!.providerId!).map((a) => {
      const pricingType = app.db.get<{pricing_type:string}>('SELECT pricing_type FROM orders WHERE id=?', a.order_id)?.pricing_type || 'FIXED';
      const quote = pricingType === 'QUOTE' ? app.db.get<{id:string; amount:number; status:string}>('SELECT id, amount, status FROM quotes WHERE order_id=? AND provider_id=?', a.order_id, ctx.user!.providerId) : undefined;
      return { id: a.id, orderId: a.order_id, orderCode: a.orderCode, serviceName: a.serviceName, areaName: a.areaName, priority: a.priority, distanceKm: a.distance_km, offeredAt: a.offered_at, expiresAt: a.expires_at, pricingType, quoteStatus: quote?.status || null, quoteId: quote?.id || null, quoteAmount: quote?.amount ?? null };
    })
  }));

  r.post('/provider/offers/:id/accept', ...isProvider, (ctx: Ctx) => ({ order: orders.serialize(app.assignment.acceptOffer(ctx.params['id']!, ctx), ctx) }));
  r.post('/provider/offers/:id/reject', ...isProvider, (ctx: Ctx) => { app.assignment.rejectOffer(ctx.params['id']!, ctx); return { ok: true }; });

  r.get('/provider/orders', ...isProvider, (ctx: Ctx) => {
    const where = ctx.query['status'] ? ' AND status = ?' : '';
    const params: unknown[] = [ctx.user!.providerId]; if (ctx.query['status']) params.push(ctx.query['status']);
    const rows = db.all<OrderRow>(`SELECT * FROM orders WHERE provider_id = ?${where} ORDER BY created_at DESC LIMIT 100`, ...params);
    return { orders: rows.map((o) => orders.serialize(o, ctx)) };
  });

  r.post('/provider/orders/:id/status', ...isProvider, (ctx: Ctx) => {
    const b = parse<{ to: OrderStatus }>(s.obj({ to: s.oneOf(['ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED']) }), ctx.body);
    return db.tx(() => {
      const o = db.get<OrderRow>('SELECT * FROM orders WHERE id = ? AND provider_id = ?', ctx.params['id'], ctx.user!.providerId);
      if (!o) throw E.notFound('الطلب غير موجود');
      if (PROVIDER_STEPS[o.status] !== b.to || !canTransition(o.status, b.to, 'PROVIDER')) throw E.unprocessable(`لا يمكن الانتقال من ${o.status} إلى ${b.to}`, 'INVALID_TRANSITION');
      const updated = orders.applyTransition(o, b.to, 'PROVIDER', ctx);
      if (b.to === 'COMPLETED') {
        const proof = db.get<{delivery_proof_type:string}>('SELECT delivery_proof_type FROM services WHERE id=?', o.service_id);
        if (proof?.delivery_proof_type && proof.delivery_proof_type !== 'NONE' && !db.get('SELECT 1 FROM orders WHERE id=? AND delivery_proof_verified_at IS NOT NULL', o.id)) throw E.unprocessable('يجب إكمال إثبات التسليم قبل إنهاء الطلب', 'DELIVERY_PROOF_REQUIRED');
        db.run('UPDATE service_providers SET completed_orders_count = completed_orders_count + 1, updated_at = ? WHERE id = ?', iso(app.clock.now()), o.provider_id); app.payment.onCompleted(updated); }
      const map: Record<string, 'PROVIDER_ON_THE_WAY' | 'SERVICE_STARTED' | 'ORDER_COMPLETED'> = { ON_THE_WAY: 'PROVIDER_ON_THE_WAY', IN_PROGRESS: 'SERVICE_STARTED', COMPLETED: 'ORDER_COMPLETED' };
      app.notifications.notify(o.customer_id, map[b.to]!, { code: o.code }, { orderId: o.id });
      return { order: orders.serialize(updated, ctx) };
    });
  });
}
