import { s, parse } from '../core/validate.js';
import { E } from '../core/errors.js';
import { uuid } from '../core/security.js';
import { iso, parseJson } from '../core/util.js';
import { auth, roles } from './auth.middleware.js';
const taskSchema = s.obj({ title: s.str({ min: 2, max: 200 }), taskType: s.str({ min: 2, max: 50, optional: true }), details: s.str({ max: 1000, optional: true }) });
export function executionEvent(app, orderId, eventType, title, detail, actorRole, actorId, metadata = {}) {
    const now = iso(app.clock.now());
    app.db.run('INSERT INTO order_execution_events(order_id,event_type,title,detail,actor_role,actor_id,metadata,created_at) VALUES(?,?,?,?,?,?,?,?)', orderId, eventType, title, detail || null, actorRole, actorId || null, JSON.stringify(metadata), now);
    try {
        for (const a of app.db.all("SELECT u.id FROM users u JOIN admin_users au ON au.user_id=u.id WHERE u.status='ACTIVE'"))
            app.sse.send(a.id, 'sync', { scope: 'admin', orderId, eventType });
    }
    catch { /* realtime admin notification must never break order state */ }
}
export function registerExecutionRoutes(app, r) {
    const { db } = app;
    const owned = (id, ctx) => {
        const o = db.get('SELECT * FROM orders WHERE id=?', id);
        if (!o)
            throw E.notFound('الطلب غير موجود');
        if (ctx.user.role === 'CUSTOMER' && o.customer_id !== ctx.user.id)
            throw E.forbidden();
        if (ctx.user.role === 'PROVIDER' && o.provider_id !== ctx.user.providerId && !db.get("SELECT 1 FROM order_assignments WHERE order_id=? AND provider_id=? AND status IN ('OFFERED','ACCEPTED')", id, ctx.user.providerId))
            throw E.notFound('الطلب غير موجود');
        if (ctx.user.role !== 'ADMIN' && ctx.user.role !== 'CUSTOMER' && ctx.user.role !== 'PROVIDER')
            throw E.forbidden();
        return o;
    };
    r.get('/orders/:id/tasks', auth, (ctx) => { const o = owned(ctx.params.id, ctx); return { tasks: db.all('SELECT id,sequence_no sequenceNo,title,task_type taskType,status,details,created_at createdAt,updated_at updatedAt FROM order_tasks WHERE order_id=? ORDER BY sequence_no', o.id) }; });
    r.post('/orders/:id/tasks', auth, roles('CUSTOMER'), (ctx) => { const o = owned(ctx.params.id, ctx); if (!['PENDING', 'SEARCHING', 'ASSIGNED'].includes(o.status))
        throw E.unprocessable('لا يمكن تعديل مهام الطلب بعد بدء قبول الخدمة أو تنفيذها', 'ORDER_SCOPE_LOCKED'); const b = parse(s.obj({ tasks: s.arr(taskSchema, { min: 1, max: 20 }) }), ctx.body); const now = iso(app.clock.now()); return db.tx(() => { const latest = db.get('SELECT * FROM orders WHERE id=?', o.id); if (!latest || latest.customer_id !== ctx.user.id)
        throw E.notFound('الطلب غير موجود'); if (!['PENDING', 'SEARCHING', 'ASSIGNED'].includes(latest.status))
        throw E.conflict('تغيرت حالة الطلب؛ لا يمكن إضافة مهام الآن', 'ORDER_SCOPE_LOCKED'); const start = Number(db.get('SELECT COALESCE(MAX(sequence_no),0) n FROM order_tasks WHERE order_id=?', o.id)?.n || 0); for (let i = 0; i < b.tasks.length; i++)
        db.run('INSERT INTO order_tasks(id,order_id,sequence_no,title,task_type,status,details,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', uuid(), o.id, start + i + 1, b.tasks[i].title, b.tasks[i].taskType || 'GENERAL', 'PENDING', b.tasks[i].details || null, now, now); executionEvent(app, o.id, 'COMPOUND_TASKS_ADDED', 'إضافة مهام مركبة', `تمت إضافة ${b.tasks.length} مهام`, 'CUSTOMER', ctx.user.id, { count: b.tasks.length }); return { tasks: db.all('SELECT id,sequence_no sequenceNo,title,task_type taskType,status,details,created_at createdAt,updated_at updatedAt FROM order_tasks WHERE order_id=? ORDER BY sequence_no', o.id) }; }); });
    r.patch('/orders/:id/tasks/:taskId', auth, (ctx) => { const o = owned(ctx.params.id, ctx); if (ctx.user.role !== 'PROVIDER' && ctx.user.role !== 'ADMIN')
        throw E.forbidden('تغيير حالة المهمة متاح لمقدم الخدمة المسند إليه الطلب أو للإدارة فقط'); if (ctx.user.role === 'PROVIDER' && o.provider_id !== ctx.user.providerId)
        throw E.forbidden('لا يمكن تحديث مهام الطلب قبل إسناده إليك', 'ORDER_NOT_ASSIGNED'); if (!['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'].includes(o.status))
        throw E.unprocessable('لا يمكن تعديل المهام في حالة الطلب الحالية', 'ORDER_NOT_EXECUTING'); const b = parse(s.obj({ status: s.oneOf(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']), details: s.str({ max: 1000, optional: true }) }), ctx.body); const now = iso(app.clock.now()); return db.tx(() => { const latest = db.get('SELECT * FROM orders WHERE id=?', o.id); if (!latest || !['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'].includes(latest.status) || (ctx.user.role === 'PROVIDER' && latest.provider_id !== ctx.user.providerId))
        throw E.conflict('تغيرت حالة الطلب؛ أعد تحميله قبل تحديث المهمة', 'ORDER_STATE_CHANGED'); const t = db.get('SELECT * FROM order_tasks WHERE id=? AND order_id=?', ctx.params.taskId, o.id); if (!t)
        throw E.notFound('المهمة غير موجودة'); const allowed = { PENDING: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [] }; if (!allowed[t.status]?.includes(b.status))
        throw E.unprocessable(`لا يمكن تغيير حالة المهمة من ${t.status} إلى ${b.status}`, 'INVALID_TASK_TRANSITION'); const changed = db.run('UPDATE order_tasks SET status=?,details=COALESCE(?,details),updated_at=? WHERE id=? AND order_id=? AND status=?', b.status, b.details ?? null, now, t.id, o.id, t.status); if (Number(changed.changes) !== 1)
        throw E.conflict('تم تحديث المهمة من عملية أخرى؛ أعد تحميل البيانات', 'TASK_STATE_CHANGED'); executionEvent(app, o.id, 'TASK_STATUS', `تحديث المهمة: ${t.title}`, `من ${t.status} إلى ${b.status}`, ctx.user.role, ctx.user.id, { taskId: t.id, fromStatus: t.status, status: b.status }); return { ok: true, task: db.get('SELECT id,sequence_no sequenceNo,title,task_type taskType,status,details,updated_at updatedAt FROM order_tasks WHERE id=?', t.id) }; }); });
    r.get('/orders/:id/timeline', auth, (ctx) => { const o = owned(ctx.params.id, ctx); const history = db.all('SELECT h.created_at at,h.actor_role actorRole,h.reason detail,h.to_status toStatus FROM order_status_history h WHERE h.order_id=? ORDER BY h.id', o.id).map(x => ({ type: 'STATUS', at: x.at, title: `حالة الطلب: ${x.toStatus}`, detail: x.detail, actorRole: x.actorRole })); const events = db.all('SELECT created_at at,event_type type,title,detail,actor_role actorRole,metadata FROM order_execution_events WHERE order_id=? ORDER BY id', o.id).map(x => ({ ...x, metadata: parseJson(x.metadata, {}) })); const assigns = db.all('SELECT a.offered_at at,a.status,a.decision_reason detail,sp.display_name providerName FROM order_assignments a JOIN service_providers sp ON sp.id=a.provider_id WHERE a.order_id=? ORDER BY a.offered_at', o.id).map(x => ({ type: 'ASSIGNMENT', at: x.at, title: `إسناد إلى ${x.providerName}`, detail: x.detail || x.status, actorRole: 'SYSTEM' })); const changes = db.all('SELECT created_at at,status,requested_price requestedPrice,requested_product requestedProduct FROM purchase_change_requests WHERE order_id=? ORDER BY created_at', o.id).map(x => ({ type: 'PRICE_CHANGE', at: x.at, title: 'تغيير مقترح في السعر', detail: `${x.requestedPrice} ${x.requestedProduct || ''} · ${x.status}`, actorRole: 'SYSTEM' })); const notes = db.all(`SELECT created_at at,type,params FROM notifications WHERE json_extract(data,'$.orderId')=? ORDER BY created_at`, o.id).map(x => ({ type: 'NOTIFICATION', at: x.at, title: 'تم إنشاء إشعار', detail: String(x.type), actorRole: 'SYSTEM' })); return { timeline: [...history, ...events, ...assigns, ...changes, ...notes].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) }; });
    r.get('/admin/execution/behavior-flags', auth, roles('ADMIN'), () => ({ flags: db.all('SELECT * FROM provider_behavior_flags ORDER BY last_seen_at DESC LIMIT 500') }));
}
//# sourceMappingURL=execution.js.map