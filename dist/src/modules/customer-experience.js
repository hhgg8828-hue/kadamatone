import { s, parse } from '../core/validate.js';
import { E } from '../core/errors.js';
import { uuid } from '../core/security.js';
import { iso, tr } from '../core/util.js';
import { auth, roles } from './auth.middleware.js';
const serializeBeneficiary = (app, b, locale) => ({ id: b.id, label: b.label, fullName: b.full_name, phone: b.phone, location: b.location_id ? app.locations.serialize(app.db.get('SELECT * FROM locations WHERE id=?', b.location_id), locale) : null });
const beneficiarySchema = s.obj({
    label: s.str({ min: 1, max: 40 }), fullName: s.str({ min: 2, max: 80 }), phone: s.str({ min: 8, max: 24 }),
    location: s.obj({ lat: s.num({ min: -90, max: 90 }), lng: s.num({ min: -180, max: 180 }), accuracy: s.num({ min: 0, max: 100000, optional: true }), addressText: s.str({ max: 300, optional: true }), source: s.oneOf(['gps', 'map', 'manual'], { optional: true, default: 'manual' }) }, { optional: true })
});
export function registerCustomerExperienceRoutes(app, r) {
    const { db } = app;
    r.get('/me/favorites/providers', auth, roles('CUSTOMER'), (ctx) => ({ providers: db.all(`SELECT sp.id,sp.display_name displayName,sp.rating_avg rating,sp.verification_status verificationStatus FROM favorite_providers f JOIN service_providers sp ON sp.id=f.provider_id WHERE f.customer_id=? ORDER BY f.created_at DESC`, ctx.user.id) }));
    r.post('/me/favorites/providers/:providerId', auth, roles('CUSTOMER'), (ctx) => {
        const p = db.get('SELECT id FROM service_providers WHERE id=?', ctx.params.providerId);
        if (!p)
            throw E.notFound('مقدم الخدمة غير موجود');
        db.run('INSERT OR IGNORE INTO favorite_providers(customer_id,provider_id,created_at) VALUES(?,?,?)', ctx.user.id, ctx.params.providerId, iso(app.clock.now()));
        return { ok: true };
    });
    r.delete('/me/favorites/providers/:providerId', auth, roles('CUSTOMER'), (ctx) => { db.run('DELETE FROM favorite_providers WHERE customer_id=? AND provider_id=?', ctx.user.id, ctx.params.providerId); return { ok: true }; });
    r.get('/me/beneficiaries', auth, roles('CUSTOMER'), (ctx) => ({ beneficiaries: db.all('SELECT * FROM customer_beneficiaries WHERE customer_id=? ORDER BY updated_at DESC', ctx.user.id).map(b => serializeBeneficiary(app, b, ctx.locale)) }));
    r.post('/me/beneficiaries', auth, roles('CUSTOMER'), (ctx) => {
        const b = parse(beneficiarySchema, ctx.body);
        const id = uuid(), now = iso(app.clock.now());
        let locId = null;
        if (b.location)
            locId = app.locations.create(b.location).id;
        db.run('INSERT INTO customer_beneficiaries(id,customer_id,label,full_name,phone,location_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', id, ctx.user.id, b.label, b.fullName, b.phone, locId, now, now);
        return { beneficiary: serializeBeneficiary(app, db.get('SELECT * FROM customer_beneficiaries WHERE id=?', id), ctx.locale) };
    });
    r.patch('/me/beneficiaries/:id', auth, roles('CUSTOMER'), (ctx) => {
        const old = db.get('SELECT * FROM customer_beneficiaries WHERE id=? AND customer_id=?', ctx.params.id, ctx.user.id);
        if (!old)
            throw E.notFound('المستفيد غير موجود');
        const b = parse(s.obj({ label: s.str({ min: 1, max: 40, optional: true }), fullName: s.str({ min: 2, max: 80, optional: true }), phone: s.str({ min: 8, max: 24, optional: true }), location: s.obj({ lat: s.num({ min: -90, max: 90 }), lng: s.num({ min: -180, max: 180 }), accuracy: s.num({ min: 0, max: 100000, optional: true }), addressText: s.str({ max: 300, optional: true }), source: s.oneOf(['gps', 'map', 'manual'], { optional: true, default: 'manual' }) }, { optional: true }) }), ctx.body);
        const loc = b.location ? app.locations.create(b.location).id : old.location_id;
        const now = iso(app.clock.now());
        db.run('UPDATE customer_beneficiaries SET label=COALESCE(?,label),full_name=COALESCE(?,full_name),phone=COALESCE(?,phone),location_id=?,updated_at=? WHERE id=?', b.label ?? null, b.fullName ?? null, b.phone ?? null, loc, now, old.id);
        return { ok: true };
    });
    r.delete('/me/beneficiaries/:id', auth, roles('CUSTOMER'), (ctx) => { const x = db.run('DELETE FROM customer_beneficiaries WHERE id=? AND customer_id=?', ctx.params.id, ctx.user.id); if (!x.changes)
        throw E.notFound('المستفيد غير موجود'); return { ok: true }; });
    r.get('/me/recommendations', auth, roles('CUSTOMER'), (ctx) => {
        const rows = db.all(`SELECT o.service_id serviceId, COUNT(*) uses, MAX(o.created_at) lastUsed
      FROM orders o WHERE o.customer_id=? AND o.status <> 'CANCELLED' GROUP BY o.service_id ORDER BY uses DESC, lastUsed DESC LIMIT 8`, ctx.user.id);
        const searched = db.all(`SELECT service_id serviceId, COUNT(*) uses, MAX(created_at) lastUsed
      FROM customer_searches WHERE customer_id=? AND service_id IS NOT NULL GROUP BY service_id ORDER BY uses DESC, lastUsed DESC LIMIT 8`, ctx.user.id);
        const ids = [...new Set([...rows, ...searched].map((x) => x.serviceId).filter(Boolean))];
        const usage = new Map();
        for (const x of [...rows, ...searched]) {
            const prev = usage.get(x.serviceId) || { uses: 0, lastUsed: x.lastUsed };
            prev.uses += Number(x.uses || 0);
            if (String(x.lastUsed) > String(prev.lastUsed))
                prev.lastUsed = x.lastUsed;
            usage.set(x.serviceId, prev);
        }
        const out = ids.map(id => { const svc = app.catalog.all().byService.get(id); if (!svc || !svc.is_active)
            return null; const u = usage.get(id); return { ...app.catalog.serializeService(svc, ctx.locale), personalUses: u.uses, lastUsed: u.lastUsed }; }).filter(Boolean).sort((a, b) => b.personalUses - a.personalUses || String(b.lastUsed).localeCompare(String(a.lastUsed))).slice(0, 8);
        return { recommendations: out, source: 'customer-only' };
    });
    r.get('/me/searches/recent', auth, roles('CUSTOMER'), (ctx) => ({ searches: db.all('SELECT query,service_id serviceId,created_at createdAt FROM customer_searches WHERE customer_id=? ORDER BY id DESC LIMIT 10', ctx.user.id) }));
    r.post('/assist/session', auth, roles('CUSTOMER'), async (ctx) => {
        const b = parse(s.obj({ sessionId: s.str({ max: 64, optional: true }), text: s.str({ min: 1, max: 500 }), imageFileId: s.str({ max: 64, optional: true }) }), ctx.body);
        let session = b.sessionId ? db.get('SELECT * FROM assistant_sessions WHERE id=? AND customer_id=? AND status=\'ACTIVE\'', b.sessionId, ctx.user.id) : null;
        const now = iso(app.clock.now());
        if (!session) {
            const id = uuid();
            db.run('INSERT INTO assistant_sessions(id,customer_id,status,draft_json,created_at,updated_at) VALUES(?,?,?,?,?,?)', id, ctx.user.id, 'ACTIVE', '{}', now, now);
            session = db.get('SELECT * FROM assistant_sessions WHERE id=?', id);
        }
        let image;
        if (b.imageFileId) {
            const f = db.get("SELECT id,mime,storage_key,size FROM files WHERE id=? AND owner_id=? AND purpose='order_attachment'", b.imageFileId, ctx.user.id);
            if (!f)
                throw E.notFound('الصورة غير موجودة');
            if (f.size > 5 * 1024 * 1024)
                throw E.unprocessable('حجم الصورة كبير', 'FILE_TOO_LARGE');
            image = { mime: f.mime, dataBase64: app.storage.read(f.storage_key).toString('base64') };
        }
        db.run('INSERT INTO assistant_messages(id,session_id,role,body,image_file_id,created_at) VALUES(?,?,?,?,?,?)', uuid(), session.id, 'CUSTOMER', b.text, b.imageFileId || null, now);
        const prior = JSON.parse(session.draft_json || '{}');
        const result = await app.intentParser.parse(b.text, { catalog: app.catalog, locale: ctx.locale, image });
        let top = result.matches[0];
        if (prior.serviceId && prior.purchaseIntent) {
            const priorSvc = app.catalog.all().byService.get(prior.serviceId);
            if (priorSvc) {
                const cat = app.catalog.all().byCategory.get(priorSvc.category_id);
                top = { serviceId: priorSvc.id, serviceSlug: priorSvc.slug, serviceName: tr(priorSvc.name_i18n, ctx.locale), categoryId: priorSvc.category_id, categorySlug: cat?.slug || '', categoryName: tr(cat?.name_i18n, ctx.locale), score: 0.5, confidence: 0.5, icon: priorSvc.icon };
            }
        }
        if (!top && prior.serviceId) {
            const priorSvc = app.catalog.all().byService.get(prior.serviceId);
            if (priorSvc) {
                const cat = app.catalog.all().byCategory.get(priorSvc.category_id);
                top = { serviceId: priorSvc.id, serviceSlug: priorSvc.slug, serviceName: tr(priorSvc.name_i18n, ctx.locale), categoryId: priorSvc.category_id, categorySlug: cat?.slug || '', categoryName: tr(cat?.name_i18n, ctx.locale), score: 0.3, confidence: 0.3, icon: priorSvc.icon };
            }
        }
        if (!top && result.extracted.purchaseIntent) {
            const fallback = app.catalog.all().services.find(x => x.is_active && ['shopping-delivery', 'purchase-and-delivery', 'pharmacy-purchase'].includes(x.slug));
            if (fallback) {
                const cat = app.catalog.all().byCategory.get(fallback.category_id);
                top = { serviceId: fallback.id, serviceSlug: fallback.slug, serviceName: tr(fallback.name_i18n, ctx.locale), categoryId: fallback.category_id, categorySlug: cat?.slug || '', categoryName: tr(cat?.name_i18n, ctx.locale), score: 0.60, confidence: 0.60, icon: fallback.icon };
            }
        }
        if (result.extracted.purchaseIntent && top && !['shopping-delivery', 'purchase-and-delivery', 'pharmacy-purchase', 'motorcycle-trips'].includes(top.serviceSlug)) {
            const fallback = app.catalog.all().services.find(x => x.is_active && x.slug === (/صيدلية|دواء|علاج/.test(b.text) ? 'pharmacy-purchase' : 'purchase-and-delivery'));
            if (fallback) {
                const cat = app.catalog.all().byCategory.get(fallback.category_id);
                top = { serviceId: fallback.id, serviceSlug: fallback.slug, serviceName: tr(fallback.name_i18n, ctx.locale), categoryId: fallback.category_id, categorySlug: cat?.slug || '', categoryName: tr(cat?.name_i18n, ctx.locale), score: Math.max(top.score, 0.60), confidence: Math.max(top.confidence, 0.60), icon: fallback.icon };
            }
        }
        const confirmation = /^(نعم|ايوه|أيوه|نعم ارسل|ارسل|أرسل|تمام|موافق|موافقه|موافقًا|نفذ|نفذ الطلب)$/i.test(String(b.text).trim());
        const priorHasService = Boolean(prior.serviceId);
        const destinationCandidate = priorHasService && prior.purchaseIntent && !confirmation && b.text.trim().length >= 3 && !/^(نعم|ايوه|أيوه|تمام|موافق|ارسل|أرسل|نفذ)/i.test(b.text.trim()) ? b.text.trim() : null;
        const purchaseIntent = Boolean(result.extracted.purchaseIntent || prior.purchaseIntent);
        const inferredTaskType = result.extracted.purchaseIntent ? (/صيدلية|دواء|علاج/.test(b.text) ? 'PURCHASE_PHARMACY' : 'PURCHASE_AND_DELIVERY') : null;
        const draft = { ...prior, rawText: [...(prior.rawText || []), b.text].slice(-8), serviceId: top?.serviceId || prior.serviceId || null, serviceName: top?.serviceName || prior.serviceName || null, imageFileId: b.imageFileId || prior.imageFileId || null, purchaseIntent, priority: result.priority, destinationText: prior.destinationText || destinationCandidate || null, taskType: prior.taskType || inferredTaskType, requiredCapabilities: inferredTaskType === 'PURCHASE_PHARMACY' ? ['purchase:pharmacy', 'delivery:item'] : inferredTaskType ? ['purchase:store', 'delivery:item'] : [], confirmed: prior.confirmed || confirmation };
        let question = null;
        if (!draft.serviceId)
            question = 'ما الذي تريد تنفيذه؟ يمكنك كتابة اسم الغرض أو إرسال صورة له.';
        else if (draft.purchaseIntent && !draft.destinationText)
            question = 'أين تريد توصيله؟';
        else if (result.clarification?.question && !draft.confirmed && !(draft.purchaseIntent && draft.destinationText))
            question = result.clarification.question;
        else if (!draft.confirmed)
            question = 'فهمت طلبك. هل تريد إرسال الطلب الآن؟';
        const reply = question === 'فهمت طلبك. هل تريد إرسال الطلب الآن؟' ? `فهمت أنك تريد ${draft.serviceName || 'تنفيذ هذه المهمة'}. هل تريد إرسال الطلب الآن؟` : question || 'فهمت طلبك. أعطني المعلومة الناقصة وسأكمل الطلب.';
        db.run('UPDATE assistant_sessions SET draft_json=?,updated_at=? WHERE id=?', JSON.stringify(draft), now, session.id);
        db.run('INSERT INTO intent_audit(id,customer_id,assistant_session_id,original_text,image_attached,predicted_service_id,predicted_confidence,parser_source,selected_service_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', uuid(), ctx.user.id, session.id, b.text, b.imageFileId ? 1 : 0, draft.serviceId || null, top?.confidence || null, result.source, draft.serviceId || null, now, now);
        db.run('INSERT INTO assistant_messages(id,session_id,role,body,created_at) VALUES(?,?,?,?,?)', uuid(), session.id, 'ASSISTANT', reply, now);
        return { sessionId: session.id, reply, question, draft, result, ready: Boolean(draft.serviceId && question?.includes('إرسال الطلب')) };
    });
    r.get('/assist/session/:id', auth, roles('CUSTOMER'), (ctx) => { const x = db.get('SELECT * FROM assistant_sessions WHERE id=? AND customer_id=?', ctx.params.id, ctx.user.id); if (!x)
        throw E.notFound('جلسة المساعد غير موجودة'); return { sessionId: x.id, status: x.status, draft: JSON.parse(x.draft_json || '{}'), messages: db.all('SELECT role,body,image_file_id imageFileId,created_at createdAt FROM assistant_messages WHERE session_id=? ORDER BY created_at,id', x.id) }; });
    r.post('/assist/request', auth, roles('CUSTOMER'), async (ctx) => {
        const b = parse(s.obj({ text: s.str({ min: 2, max: 500 }), imageFileId: s.str({ max: 64, optional: true }) }), ctx.body);
        let image;
        if (b.imageFileId) {
            const f = db.get("SELECT id,mime,storage_key,size,purpose FROM files WHERE id=? AND owner_id=? AND purpose='order_attachment'", b.imageFileId, ctx.user.id);
            if (!f)
                throw E.notFound('الصورة غير موجودة');
            if (f.size > 5 * 1024 * 1024)
                throw E.unprocessable('حجم الصورة كبير', 'FILE_TOO_LARGE');
            image = { mime: f.mime, dataBase64: app.storage.read(f.storage_key).toString('base64') };
        }
        const result = await app.intentParser.parse(b.text, { catalog: app.catalog, locale: ctx.locale, image });
        let top = result.matches[0];
        if (result.extracted.purchaseIntent) {
            const desired = /صيدلية|دواء|علاج/.test(b.text) ? 'pharmacy-purchase' : 'purchase-and-delivery';
            const fallback = app.catalog.all().services.find(x => x.is_active && x.slug === desired);
            if (fallback) {
                const cat = app.catalog.all().byCategory.get(fallback.category_id);
                top = { serviceId: fallback.id, serviceSlug: fallback.slug, serviceName: tr(fallback.name_i18n, ctx.locale), categoryId: fallback.category_id, categorySlug: cat?.slug || '', categoryName: tr(cat?.name_i18n, ctx.locale), score: 0.60, confidence: 0.60, icon: fallback.icon };
            }
        }
        db.run('INSERT INTO customer_searches(customer_id,query,service_id,created_at) VALUES(?,?,?,?)', ctx.user.id, b.text, top?.serviceId || null, iso(app.clock.now()));
        return { ...result, matches: top ? [top, ...result.matches.filter(x => x.serviceId !== top.serviceId)] : result.matches, recommended: top && top.confidence >= 0.40 ? top : null, customService: app.catalog.all().services.find(x => x.slug === 'custom-request')?.id || null };
    });
    r.get('/orders/:id/purchase-change', auth, (ctx) => {
        const o = db.get('SELECT * FROM orders WHERE id=?', ctx.params.id);
        if (!o)
            throw E.notFound('الطلب غير موجود');
        if (ctx.user.role === 'CUSTOMER' && o.customer_id !== ctx.user.id)
            throw E.forbidden();
        if (ctx.user.role === 'PROVIDER' && o.provider_id !== ctx.user.providerId)
            throw E.forbidden();
        return { changes: db.all('SELECT id,requested_price requestedPrice,requested_product requestedProduct,reason,status,created_at createdAt,responded_at respondedAt FROM purchase_change_requests WHERE order_id=? ORDER BY created_at DESC', o.id) };
    });
    r.post('/provider/orders/:id/purchase-change', auth, roles('PROVIDER'), (ctx) => {
        const b = parse(s.obj({ requestedPrice: s.num({ min: 0, max: 100000000 }), requestedProduct: s.str({ max: 300, optional: true }), reason: s.str({ max: 500, optional: true }) }), ctx.body);
        const o = db.get(`SELECT o.*, s.slug service_slug FROM orders o JOIN services s ON s.id=o.service_id WHERE o.id=? AND o.provider_id=?`, ctx.params.id, ctx.user.providerId);
        if (!o)
            throw E.notFound('الطلب غير موجود');
        const trip = db.get('SELECT purpose FROM trip_orders WHERE order_id=?', o.id);
        const purchaseSlugs = new Set(['purchase-and-delivery', 'pharmacy-purchase']);
        const isPurchase = purchaseSlugs.has(String(o.service_slug)) || ['ITEM_PURCHASE', 'MEDICINE', 'STORE_SHOPPING'].includes(String(trip?.purpose || ''));
        if (!isPurchase)
            throw E.unprocessable('هذا الطلب ليس طلب شراء بالنيابة', 'PURCHASE_NOT_APPLICABLE');
        if (!['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'].includes(o.status))
            throw E.unprocessable('يمكن تعديل الشراء بعد قبول الطلب وأثناء تنفيذه', 'PURCHASE_CHANGE_STATE');
        if (db.get("SELECT 1 FROM purchase_change_requests WHERE order_id=? AND status='PENDING'", o.id))
            throw E.conflict('يوجد طلب تعديل شراء بانتظار رد العميل', 'PURCHASE_CHANGE_PENDING');
        const id = uuid(), now = iso(app.clock.now());
        db.run('INSERT INTO purchase_change_requests(id,order_id,provider_id,requested_price,requested_product,reason,created_at) VALUES(?,?,?,?,?,?,?)', id, o.id, ctx.user.providerId, b.requestedPrice, b.requestedProduct || null, b.reason || null, now);
        app.notifications.notify(o.customer_id, 'PURCHASE_CHANGE_REQUEST', { code: o.code, amount: b.requestedPrice }, { orderId: o.id });
        return { change: db.get('SELECT id,requested_price requestedPrice,requested_product requestedProduct,reason,status,created_at createdAt FROM purchase_change_requests WHERE id=?', id) };
    });
    r.post('/orders/:id/purchase-change/:changeId/respond', auth, roles('CUSTOMER'), (ctx) => {
        const b = parse(s.obj({ decision: s.oneOf(['APPROVE', 'REJECT']) }), ctx.body);
        const o = db.get('SELECT * FROM orders WHERE id=? AND customer_id=?', ctx.params.id, ctx.user.id);
        if (!o)
            throw E.notFound('الطلب غير موجود');
        const c = db.get('SELECT * FROM purchase_change_requests WHERE id=? AND order_id=? AND status=\'PENDING\'', ctx.params.changeId, o.id);
        if (!c)
            throw E.notFound('طلب تغيير الشراء غير موجود');
        const now = iso(app.clock.now());
        db.run('UPDATE purchase_change_requests SET status=?,responded_at=? WHERE id=?', 'APPROVE' === b.decision ? 'APPROVED' : 'REJECTED', now, c.id);
        if (b.decision === 'APPROVE')
            db.run('UPDATE orders SET agreed_price=?,updated_at=?,version=version+1 WHERE id=?', c.requested_price, now, o.id);
        if (o.provider_id) {
            const pu = db.get('SELECT user_id FROM service_providers WHERE id=?', o.provider_id);
            if (pu)
                app.notifications.notify(pu.user_id, 'PURCHASE_CHANGE_RESPONDED', { code: o.code, approved: b.decision === 'APPROVE' ? 'وافق' : 'رفض' }, { orderId: o.id });
        }
        return { ok: true, status: b.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' };
    });
    r.post('/orders/:id/reorder', auth, roles('CUSTOMER'), (ctx) => {
        const o = db.get('SELECT * FROM orders WHERE id=? AND customer_id=?', ctx.params.id, ctx.user.id);
        if (!o)
            throw E.notFound('الطلب غير موجود');
        const loc = db.get('SELECT lat,lng,accuracy_m accuracy,address_text addressText,source,area_id areaId FROM locations WHERE id=?', o.location_id);
        if (!loc)
            throw E.unprocessable('موقع الطلب السابق غير متاح', 'LOCATION_UNAVAILABLE');
        return { draft: { serviceId: o.service_id, description: o.description, formData: JSON.parse(o.form_data || '{}'), notes: o.customer_notes || '', contactPhone: o.contact_phone, priority: o.priority, location: loc, sourceOrderId: o.id } };
    });
}
//# sourceMappingURL=customer-experience.js.map