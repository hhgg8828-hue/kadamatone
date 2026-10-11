import { s, parse } from '../core/validate.js';
import { E } from '../core/errors.js';
import { uuid } from '../core/security.js';
import { iso, round } from '../core/util.js';
import { auth, roles } from './auth.middleware.js';
import type { App } from '../app.js';
import type { Ctx, Router } from '../core/http.js';
import { executionEvent } from './execution.js';
import type { OrderRow, RatingRow } from '../types/domain.js';

const FEEDBACK_REASONS = ['DELAY','BEHAVIOR','QUALITY','NOT_AS_DESCRIBED','PACKAGING','TEMPERATURE','CLEANLINESS','ARRIVAL','COMMUNICATION','PRICE','OTHER'] as const;
type FeedbackReason = typeof FEEDBACK_REASONS[number];
const reasonLabels: Record<FeedbackReason, string> = { DELAY:'التأخير', BEHAVIOR:'التعامل', QUALITY:'جودة الخدمة أو المنتج', NOT_AS_DESCRIBED:'عدم مطابقة الوصف', PACKAGING:'التغليف', TEMPERATURE:'درجة الحرارة', CLEANLINESS:'النظافة', ARRIVAL:'الوصول إلى الموقع', COMMUNICATION:'التواصل', PRICE:'السعر', OTHER:'أخرى' };
function customerFeedbackMessage(reasons: FeedbackReason[], positive: boolean): string {
  if (positive) return 'شكرًا لك على تقييمك. يسعدنا أن تجربتك كانت جيدة، ونقدّر وقتك وملاحظاتك.';
  const first = reasons[0];
  const topic = first ? reasonLabels[first].toLowerCase() : 'التجربة';
  return `شكرًا لمشاركة ملاحظتك بشأن ${topic}. نعتذر عن أن التجربة لم تكن بالمستوى المتوقع. سجّلنا ملاحظتك لمراجعتها والعمل على تحسين الخدمة.`;
}

/**
 * التقييمات: 1–5 نجوم + تعليق اختياري. لا يُسمح بها إلا للعميل صاحب الطلب المكتمل، مرة واحدة لكل طلب (UNIQUE في DB).
 * يُحدَّث متوسط تقييم المزود (rating_avg/rating_count) في نفس المعاملة (متوسط تراكمي).
 */
export function registerRatingRoutes(app: App, r: Router): void {
  r.get('/orders/:id/rating', auth, roles('CUSTOMER'), (ctx: Ctx) => {
    const o = app.orders.getOwned(ctx.params['id']!, ctx);
    const rating = app.db.get<RatingRow>('SELECT * FROM ratings WHERE order_id = ?', o.id);
    const details = rating ? app.db.get<any>('SELECT * FROM rating_details WHERE rating_id=?', rating.id) : null;
    const item = app.db.get<any>('SELECT * FROM order_service_ratings WHERE order_id=?', o.id);
    const service = app.catalog.all().byService.get(o.service_id);
    return { order: { id: o.id, code: o.code, status: o.status, providerId: o.provider_id, serviceId: o.service_id, service: service ? app.catalog.serializeService(service, ctx.locale) : null }, rating: rating ? { id: rating.id, orderId: rating.order_id, score: rating.score, comment: (app.db.get<{comment:string}>("SELECT comment FROM reviews WHERE rating_id = ? AND status = 'VISIBLE'", rating.id)?.comment || null), reasons: details ? JSON.parse(details.reasons_json || '[]') : [], otherNote: details?.other_note || null, followupStatus: details?.followup_status || null, serviceFeedback: item ? { sentiment:item.sentiment, reasons:JSON.parse(item.reasons_json||'[]'), comment:item.comment||null } : null, createdAt: rating.created_at } : null };
  });
  const { db, orders } = app;

  r.post('/orders/:id/rating', auth, roles('CUSTOMER'), (ctx: Ctx) => {
    const b = parse<{ score: number; comment?: string; reasons?: FeedbackReason[]; otherNote?: string; serviceFeedback?: { sentiment:'LIKE'|'DISLIKE'; reasons?: FeedbackReason[]; comment?:string } }>(s.obj({
      score: s.int({ min: 1, max: 5 }), comment: s.str({ max: 500, optional: true }),
      reasons: s.arr(s.oneOf([...FEEDBACK_REASONS]), { max: 8, optional: true }), otherNote: s.str({ max: 500, optional: true }),
      serviceFeedback: s.obj({ sentiment:s.oneOf(['LIKE','DISLIKE']), reasons:s.arr(s.oneOf([...FEEDBACK_REASONS]),{max:8,optional:true}), comment:s.str({max:500,optional:true}) },{optional:true})
    }), ctx.body);
    const reasons = [...new Set(b.reasons || [])];
    const serviceReasons = [...new Set(b.serviceFeedback?.reasons || [])];
    return db.tx(() => {
      const o = orders.getOwned(ctx.params['id']!, ctx);
      if (db.get('SELECT 1 FROM ratings WHERE order_id = ?', o.id)) throw E.conflict('تم تقييم هذا الطلب مسبقًا', 'ALREADY_RATED');
      if (b.score <= 3 && reasons.length === 0) throw E.unprocessable('يرجى اختيار سبب واحد على الأقل للتقييم', 'RATING_REASON_REQUIRED');
      if (reasons.includes('OTHER') && !b.otherNote?.trim() && !b.comment?.trim()) throw E.unprocessable('اكتب توضيحًا مختصرًا لسبب «أخرى»', 'OTHER_REASON_NOTE_REQUIRED');
      if (b.serviceFeedback?.sentiment === 'DISLIKE' && serviceReasons.length === 0) throw E.unprocessable('يرجى تحديد سبب عدم الرضا عن الخدمة أو المنتج', 'SERVICE_RATING_REASON_REQUIRED');
      if (serviceReasons.includes('OTHER') && !b.serviceFeedback?.comment?.trim()) throw E.unprocessable('يرجى توضيح سبب «أخرى» للمنتج أو الخدمة', 'SERVICE_OTHER_REASON_NOTE_REQUIRED');
      if (o.status !== 'COMPLETED') throw E.unprocessable('لا يمكن التقييم إلا بعد اكتمال الطلب', 'ORDER_NOT_COMPLETED');
      if (!o.provider_id) throw E.unprocessable('لا يوجد مقدم خدمة لتقييمه', 'NO_PROVIDER');
      if (db.get('SELECT 1 FROM ratings WHERE order_id = ?', o.id)) throw E.conflict('تم تقييم هذا الطلب مسبقًا', 'ALREADY_RATED');
      const now = iso(app.clock.now());
      const ratingId = uuid();
      db.run('INSERT INTO ratings(id,order_id,customer_id,provider_id,score,created_at) VALUES (?,?,?,?,?,?)', ratingId, o.id, ctx.user!.id, o.provider_id, b.score, now);
      if (b.comment) db.run('INSERT INTO reviews(id,rating_id,comment,status,created_at) VALUES (?,?,?,?,?)', uuid(), ratingId, b.comment, 'VISIBLE', now);
      db.run('INSERT INTO rating_details(rating_id,order_id,service_id,reasons_json,other_note,followup_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', ratingId,o.id,o.service_id,JSON.stringify(reasons),b.otherNote?.trim()||null,(b.score<=3||reasons.length)?'NEW':'RESOLVED',now,now);
      if (b.serviceFeedback) db.run('INSERT INTO order_service_ratings(id,order_id,service_id,customer_id,sentiment,reasons_json,comment,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',uuid(),o.id,o.service_id,ctx.user!.id,b.serviceFeedback.sentiment,JSON.stringify(serviceReasons),b.serviceFeedback.comment?.trim()||null,now,now);
      const sp = db.get<{ rating_sum: number; rating_count: number }>('SELECT rating_sum, rating_count FROM service_providers WHERE id = ?', o.provider_id)!;
      const newSum = sp.rating_sum + b.score, newCount = sp.rating_count + 1;
      db.run('UPDATE service_providers SET rating_sum = ?, rating_count = ?, rating_avg = ?, updated_at = ? WHERE id = ?', newSum, newCount, round(newSum / newCount, 3), now, o.provider_id);
      const p = db.get<{ user_id: string }>('SELECT user_id FROM service_providers WHERE id = ?', o.provider_id)!;
      app.notifications.notify(p.user_id, 'NEW_RATING', { score: String(b.score), code: o.code }, { orderId:o.id, ratingId });
      const needsReview = b.score <= 3 || reasons.length > 0 || b.serviceFeedback?.sentiment === 'DISLIKE';
      if (needsReview) {
        app.notifications.notifyAdmins('RATING_FEEDBACK_ADMIN', { code:o.code }, { orderId:o.id, ratingId });
        app.notifications.notify(p.user_id, 'RATING_FEEDBACK_PROVIDER', { code:o.code }, { orderId:o.id, ratingId });
      }
      app.notifications.notify(ctx.user!.id,'RATING_FEEDBACK_RESPONSE',{message:customerFeedbackMessage(reasons,b.score>=4 && !b.serviceFeedback?.sentiment?.includes('DISLIKE'))},{orderId:o.id,ratingId});
      executionEvent(app,o.id,'RATING','تم تسجيل تقييم مقدم الخدمة',`التقييم ${b.score}/5`,'CUSTOMER',ctx.user!.id,{ratingId,reasonCount:reasons.length,serviceFeedback:b.serviceFeedback?.sentiment||null});
      const rating = db.get<RatingRow>('SELECT * FROM ratings WHERE id = ?', ratingId)!;
      ctx.status = 201;
      return { rating: { id: rating.id, orderId: rating.order_id, score: rating.score, comment: b.comment || null, reasons, otherNote:b.otherNote||null, serviceFeedback:b.serviceFeedback||null, followupStatus:needsReview?'NEW':'RESOLVED', createdAt: rating.created_at } };
    });
  });

  // إدارة الملاحظات: قائمة حقيقية قابلة للمتابعة وتغيير الحالة، متاحة للدعم والإدارة فقط.
  r.get('/admin/ratings', auth, (ctx: Ctx) => {
    if (ctx.user!.role !== 'ADMIN') throw E.forbidden();
    const status = String(ctx.query['status'] || '').toUpperCase();
    if (status && !['NEW','IN_REVIEW','RESOLVED'].includes(status)) throw E.unprocessable('حالة متابعة غير صالحة','INVALID_FOLLOWUP_STATUS');
    const where = status ? 'WHERE rd.followup_status=?' : '';
    const rows = db.all<any>(`SELECT rd.*,r.score,r.provider_id,r.customer_id,r.created_at rating_created_at,o.code,o.status order_status,u.full_name customer_name,sp.display_name provider_name,s.name_i18n service_name,rv.comment
      FROM rating_details rd JOIN ratings r ON r.id=rd.rating_id JOIN orders o ON o.id=rd.order_id JOIN users u ON u.id=r.customer_id JOIN service_providers sp ON sp.id=r.provider_id JOIN services s ON s.id=rd.service_id LEFT JOIN reviews rv ON rv.rating_id=r.id ${where} ORDER BY CASE rd.followup_status WHEN 'NEW' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END,rd.created_at DESC LIMIT 200`, ...(status?[status]:[]));
    return { items: rows.map(x=>({id:x.rating_id,orderId:x.order_id,orderCode:x.code,orderStatus:x.order_status,serviceId:x.service_id,serviceName:JSON.parse(x.service_name||'{}').ar||x.service_name,customerName:x.customer_name,providerName:x.provider_name,score:x.score,comment:x.comment||null,reasons:JSON.parse(x.reasons_json||'[]'),otherNote:x.other_note||null,serviceFeedback:db.get<any>('SELECT sentiment,reasons_json,comment FROM order_service_ratings WHERE order_id=?',x.order_id),followupStatus:x.followup_status,followupNote:x.followup_note,createdAt:x.created_at,respondedAt:x.responded_at})), counts:{new:Number(db.get<any>("SELECT COUNT(*) n FROM rating_details WHERE followup_status='NEW'")?.n||0),inReview:Number(db.get<any>("SELECT COUNT(*) n FROM rating_details WHERE followup_status='IN_REVIEW'")?.n||0),resolved:Number(db.get<any>("SELECT COUNT(*) n FROM rating_details WHERE followup_status='RESOLVED'")?.n||0)} };
  });
  r.patch('/admin/ratings/:id/followup', auth, (ctx: Ctx) => {
    if (ctx.user!.role !== 'ADMIN') throw E.forbidden();
    const b=parse<any>(s.obj({status:s.oneOf(['NEW','IN_REVIEW','RESOLVED']),note:s.str({max:1000,optional:true})}),ctx.body);
    const row=db.get<any>('SELECT * FROM rating_details WHERE rating_id=?',ctx.params.id!); if(!row) throw E.notFound('التقييم غير موجود');
    const now=iso(app.clock.now());
    db.run("UPDATE rating_details SET followup_status=?,followup_note=COALESCE(?,followup_note),responded_at=CASE WHEN ?='RESOLVED' THEN ? ELSE responded_at END,updated_at=? WHERE rating_id=?",b.status,b.note?.trim()||null,b.status,now,now,row.rating_id);
    app.audit.log({ctx,action:'rating.followup_update',entityType:'rating',entityId:row.rating_id,before:{status:row.followup_status},after:{status:b.status,note:b.note||null}});
    return {ok:true,status:b.status};
  });

  // تقييم المزود للعميل (اتجاه معاكس) — نفس القواعد: طلب مكتمل، مرة واحدة، والمزود المُسنَد فقط
  r.post('/provider/orders/:id/rate-customer', auth, roles('PROVIDER'), (ctx: Ctx) => {
    const b = parse<{ score: number; comment?: string }>(s.obj({ score: s.int({ min: 1, max: 5 }), comment: s.str({ max: 500, optional: true }) }), ctx.body);
    return db.tx(() => {
      const o = db.get<OrderRow>('SELECT * FROM orders WHERE id = ? AND provider_id = ?', ctx.params['id'], ctx.user!.providerId);
      if (!o) throw E.notFound('الطلب غير موجود');
      if (o.status !== 'COMPLETED') throw E.unprocessable('لا يمكن التقييم إلا بعد اكتمال الطلب', 'ORDER_NOT_COMPLETED');
      if (db.get('SELECT 1 FROM customer_ratings WHERE order_id = ?', o.id)) throw E.conflict('تم تقييم هذا العميل مسبقًا لهذا الطلب', 'ALREADY_RATED');
      const now = iso(app.clock.now());
      const id = uuid();
      db.run('INSERT INTO customer_ratings(id,order_id,provider_id,customer_id,score,comment,created_at) VALUES (?,?,?,?,?,?,?)', id, o.id, o.provider_id, o.customer_id, b.score, b.comment || null, now);
      ctx.status = 201;
      return { rating: { id, orderId: o.id, score: b.score, comment: b.comment || null, createdAt: now } };
    });
  });
}
