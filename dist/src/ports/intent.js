import { normalizeAr, tr, parseJson } from '../core/util.js';
const URGENT = ['اليوم', 'الان', 'حالا', 'فورا', 'بسرعه', 'مستعجل', 'عاجل', 'ضروري', 'طارئ', 'سريع', 'urgent', 'asap', 'now', 'today'].map(normalizeAr);
const VILLAGE = ['قرية', 'ريف', 'مزرعة', 'عزلة', 'منطقة', 'القرية', 'المزرعة', 'الريف', 'قرية صغيرة', 'مكان غير مسمى'].map(normalizeAr);
const CITY = ['مدينة', 'المدينة', 'المدينه', 'السوق', 'المركز', 'إب', 'صنعاء', 'تعز', 'عدن'].map(normalizeAr);
const PURCHASE_WORDS = ['اشتر', 'اشتري', 'اشترِ', 'يشتري', 'شراء', 'تسوق', 'تسوق لي', 'تسوق عني', 'بدلي', 'بالنيابة', 'غرض', 'دواء', 'صيدلية', 'سوق'].map(normalizeAr);
const PASSENGER_WORDS = ['يوصلني', 'يوصلنى', 'يأخذني', 'ياخذني', 'ياخذنى', 'يجيبني', 'يجيبنى', 'ينقلني', 'ينقلنى', 'توصيلة', 'مشوار شخصي', 'مشوار لي', 'اركب', 'يركبني', 'نقل شخص', 'نقلني'].map(normalizeAr);
const DELIVERY_WORDS = ['يوصله', 'يوصلها', 'يوصلهم', 'توصيل', 'يجيبه', 'يجيبها', 'احضره', 'احضرها', 'استلام', 'يأخذ الغرض', 'ياخذ الغرض', 'جيب لي'].map(normalizeAr);
const PICKUP_WORDS = ['يأخذ من', 'ياخذ من', 'استلام من', 'يستلم من', 'من بيت اخوي', 'من بيت اخي', 'من عند اخوي', 'من عند اخي', 'من بيت اخوه', 'من بيت أخوي'].map(normalizeAr);
const PHARMACY_WORDS = ['صيدلية', 'دواء', 'دوا', 'ادوية', 'علاج', 'روشتة', 'وصفة طبية'].map(normalizeAr);
const AGRI_PLOW = ['يحرث', 'احرث', 'حرث', 'حراثة', 'تجهيز الأرض', 'تجهيز الارض', 'يجهز الأرض', 'يجهز الارض'].map(normalizeAr);
const AGRI_HARVEST = ['يحصد', 'احصد', 'حصاد', 'حصد', 'محصول يحصد', 'حصيدة'].map(normalizeAr);
const AGRI_CROP = ['نقل المحصول', 'انقل المحصول', 'ينقل المحصول', 'نقل محاصيل', 'محاصيل من المزرعة', 'محصول إلى السوق'].map(normalizeAr);
const stripPrefix = (w) => w.replace(/^(وال|بال|كال|فال|لل|ال)/, '').replace(/^و(?=.{4,})/, '');
const tokenize = (norm) => norm.split(/\s+/).filter(Boolean).flatMap(w => [w, stripPrefix(w)]).filter(w => w.length >= 2);
const hasAny = (norm, words) => words.some(w => norm.includes(w));
const extractItem = (norm) => {
    const patterns = [/يشتري?\s+لي\s+(.+?)(?:\s+و(?:يوصله|يجيبه|يوصلها)|$)/, /اشتر(?:ي|ِ)?\s+لي\s+(.+?)(?:\s+و(?:يوصله|يجيبه|يوصلها)|$)/, /تسوق(?:\s+لي|\s+عني)?\s+(.+)/, /شراء\s+(.+?)(?:\s+وتوصيل|\s+ويوصل|$)/];
    for (const re of patterns) {
        const m = norm.match(re);
        if (m?.[1]) {
            const x = m[1].trim().replace(/^(هذا|هذه)\s+/, '');
            if (x.length >= 2)
                return x.slice(0, 180);
        }
    }
    return null;
};
const extractQuantity = (norm) => { const m = norm.match(/(?:عدد|كمية|كم)\s*(\d{1,4})|(?:\b|^)(\d{1,4})\s+(?:حبة|حبات|قطعة|قطع|متر|كيلو|كيلوجرام)/); const n = Number(m?.[1] || m?.[2]); return Number.isFinite(n) && n > 0 ? n : null; };
const chooseService = (data, slug) => data.find((x) => x.slug === slug && x.is_active && x.active !== false && x.isSeasonActive !== false);
function deterministic(text, { catalog, locale = 'ar' }) {
    const norm = normalizeAr(text);
    const tokens = tokenize(norm);
    const tokenSet = new Set(tokens);
    const data = catalog.all();
    const activeCats = new Map(data.categories.filter(c => c.is_active).map(c => [c.id, c]));
    const matches = [];
    const passenger = hasAny(norm, PASSENGER_WORDS);
    const pharmacy = hasAny(norm, PHARMACY_WORDS);
    const purchase = hasAny(norm, PURCHASE_WORDS);
    const delivery = hasAny(norm, DELIVERY_WORDS) || /يوصل|توصيل|يجيب/.test(norm);
    const pickupDelivery = hasAny(norm, PICKUP_WORDS) && delivery;
    const shopping = hasAny(norm, ['تسوق لي', 'تسوق عني', 'تسوق', 'اشتر لي', 'اشترِ لي', 'شراء بالنيابة'].map(normalizeAr));
    const plow = hasAny(norm, AGRI_PLOW), harvest = hasAny(norm, AGRI_HARVEST), crop = hasAny(norm, AGRI_CROP);
    let forcedSlug = null;
    if (plow)
        forcedSlug = 'seasonal-plowing';
    else if (harvest)
        forcedSlug = 'seasonal-harvest';
    else if (crop)
        forcedSlug = 'seasonal-crop-transport';
    else if (passenger)
        forcedSlug = norm.includes('دباب') || norm.includes('موتوسيكل') ? 'motorcycle-trips' : 'passenger-transport';
    else if (pharmacy && (purchase || delivery))
        forcedSlug = 'pharmacy-purchase';
    else if (shopping)
        forcedSlug = 'shopping-for-me';
    else if (purchase && delivery)
        forcedSlug = 'purchase-and-delivery';
    else if (delivery && !purchase)
        forcedSlug = 'parcel-delivery';
    for (const svc of data.services) {
        const cat = activeCats.get(svc.category_id);
        if (!svc.is_active || !cat || !catalog.getActiveService(svc.id))
            continue;
        const terms = new Set();
        for (const k of parseJson(svc.keywords, []) || [])
            terms.add(normalizeAr(k));
        for (const lang of ['ar', 'en'])
            terms.add(normalizeAr(tr(svc.name_i18n, lang)));
        let score = 0;
        if (forcedSlug === svc.slug)
            score += 12;
        for (const term of terms) {
            if (!term)
                continue;
            if (term.includes(' ')) {
                if (norm.includes(term))
                    score += 4 + term.split(' ').length;
                continue;
            }
            if (tokenSet.has(term))
                score += 3;
            else if (term.length >= 3 && tokens.some(t => t.length >= 3 && (t.startsWith(term) || term.startsWith(t))))
                score += 1.5;
        }
        for (const k of parseJson(cat.keywords, []) || []) {
            const kk = normalizeAr(k);
            if (kk && (tokenSet.has(kk) || norm.includes(kk)))
                score += .75;
        }
        if (passenger && ['car-with-driver', 'passenger-transport', 'motorcycle-trips'].includes(svc.slug))
            score += 4;
        if (purchase && delivery && ['purchase-and-delivery', 'shopping-for-me', 'pharmacy-purchase', 'shopping-delivery', 'motorcycle-trips'].includes(svc.slug))
            score += 4;
        if (plow && svc.slug === 'seasonal-plowing')
            score += 5;
        if (harvest && svc.slug === 'seasonal-harvest')
            score += 5;
        if (crop && svc.slug === 'seasonal-crop-transport')
            score += 5;
        if (score > 0)
            matches.push({ svc, cat, score });
    }
    matches.sort((a, b) => b.score - a.score);
    const top = matches.slice(0, 6).map(({ svc, cat, score }) => ({ serviceId: svc.id, serviceSlug: svc.slug, serviceName: tr(svc.name_i18n, locale), categoryId: cat.id, categorySlug: cat.slug, categoryName: tr(cat.name_i18n, locale), score, confidence: Math.min(1, Math.round((score / 6) * 100) / 100), icon: svc.icon }));
    const urgent = URGENT.some(u => norm.includes(u) || tokenSet.has(u));
    const hasVillage = VILLAGE.some(u => norm.includes(u));
    const hasCity = CITY.some(u => norm.includes(u));
    const cityPos = Math.min(...CITY.map(x => norm.indexOf(x)).filter(x => x >= 0));
    const villagePos = Math.min(...VILLAGE.map(x => norm.indexOf(x)).filter(x => x >= 0));
    const hasDirection = /\b(?:من|في|الى|إلى|ل)\b/.test(norm) || norm.includes('من') || norm.includes('الى') || norm.includes('إلى');
    const cityToVillage = hasCity && hasVillage && hasDirection && cityPos >= 0 && villagePos >= 0 && cityPos < villagePos;
    const villageToCity = hasCity && hasVillage && hasDirection && cityPos >= 0 && villagePos >= 0 && villagePos < cityPos;
    const destinationHint = cityToVillage ? 'CITY_TO_VILLAGE' : villageToCity ? 'VILLAGE_TO_CITY' : null;
    const compound = (purchase && delivery) || (/\sو\s/.test(norm) && purchase && !pharmacy);
    const item = extractItem(norm);
    const quantity = extractQuantity(norm);
    const taskType = plow ? 'AGRICULTURE_PLOWING' : harvest ? 'AGRICULTURE_HARVEST' : crop ? 'AGRICULTURE_CROP_TRANSPORT' : passenger ? 'PASSENGER' : pharmacy && (purchase || delivery) ? 'PURCHASE_PHARMACY' : purchase && delivery ? 'PURCHASE_AND_DELIVERY' : pickupDelivery ? 'PICKUP_AND_DELIVERY' : shopping ? 'SHOPPING' : delivery ? 'DELIVERY' : 'UNKNOWN';
    const requiredCapabilities = taskType === 'PASSENGER' ? ['trip:passenger'] : taskType === 'PURCHASE_PHARMACY' ? ['purchase:pharmacy', 'delivery:item'] : taskType === 'PURCHASE_AND_DELIVERY' || taskType === 'SHOPPING' ? ['purchase:store', 'delivery:item'] : taskType === 'PICKUP_AND_DELIVERY' ? ['pickup:item', 'delivery:item'] : taskType === 'DELIVERY' ? ['delivery:item'] : taskType === 'AGRICULTURE_PLOWING' ? ['agri:plowing'] : taskType === 'AGRICULTURE_HARVEST' ? ['agri:harvest'] : taskType === 'AGRICULTURE_CROP_TRANSPORT' ? ['agri:crop-transport'] : [];
    const structured = { taskType, item, quantity, pickupText: pharmacy ? 'الصيدلية' : null, deliveryText: /للبيت|الى البيت|إلى البيت|للمنزل|الى المنزل|إلى المنزل/.test(norm) ? 'منزل العميل' : null, requiredCapabilities, sourceSignals: [forcedSlug ? 'forced-intent' : '', passenger ? 'passenger-synonym' : '', purchase ? 'purchase-synonym' : '', delivery ? 'delivery-synonym' : '', pharmacy ? 'pharmacy-signal' : '', item ? 'item-extracted' : ''].filter(Boolean) };
    const steps = top.slice(0, 3).map(m => ({ serviceId: m.serviceId, serviceSlug: m.serviceSlug, serviceName: m.serviceName, reason: forcedSlug === m.serviceSlug ? 'فهم مباشر للنية من صياغة الطلب' : requiredCapabilities.length ? 'يتوافق مع القدرات المطلوبة للمهمة' : 'يتوافق مع كلمات الطلب', confidence: m.confidence }));
    let clarification = null;
    if (!top.length) {
        const custom = data.services.find(x => x.slug === 'custom-request');
        if (custom)
            clarification = { question: 'ما الخدمة التي تحتاجها؟ يمكنك وصفها بكلماتك أو إرسال صورة.', options: [{ label: tr(custom.name_i18n, locale), serviceId: custom.id }] };
    }
    else if (top[0].confidence < .35) {
        clarification = { question: 'ما الذي تريد تنفيذه تحديدًا؟', options: top.slice(0, 3).map(x => ({ label: x.serviceName, serviceId: x.serviceId })) };
    }
    const best = data.byService.get(top[0]?.serviceId || '');
    return { matches: top, priority: urgent ? 'URGENT' : (best?.default_priority || 'NORMAL'), extracted: { urgent, when: /اليوم|today/.test(norm) ? 'today' : /الان|حالا|فورا|now/.test(norm) ? 'now' : null, destinationHint, purchaseIntent: purchase, compound, structured }, steps, clarification, source: 'RULES' };
}
export class HybridIntentParser {
    config;
    failures = 0;
    circuitOpenUntil = 0;
    constructor(config) {
        this.config = config;
    }
    shouldAskAi(base, hasImage = false) {
        if (!this.config.aiIntentAuto || !this.config.aiIntentUrl || !this.config.aiIntentKey)
            return false;
        // An attached image is a first-class signal: always send it to the visual intent layer.
        // Never let a weak text-only local match bypass visual analysis.
        if (hasImage)
            return true;
        if (Date.now() < this.circuitOpenUntil)
            return false;
        // Clear, single-intent requests do not need a network round-trip.
        // AI is invoked automatically when the local parser signals ambiguity or a compound request.
        return base.clarification !== null || base.extracted.compound || (base.matches[0]?.confidence ?? 0) < 0.68;
    }
    async callAi(text, ctx) {
        const locale = ctx.locale || 'ar';
        const catalog = ctx.catalog.all().services.filter(s => s.is_active).map(s => ({
            id: s.id,
            slug: s.slug,
            name: tr(s.name_i18n, locale),
            keywords: parseJson(s.keywords, []) || [],
        }));
        const system = `أنت محلل نية داخل تطبيق خدمات يمني. مهمتك تحديد الخدمة أو الخدمات الموجودة فعلًا في الكتالوج من طلب العميل. لا تخترع خدمة أو معرفًا غير موجود. إذا كانت هناك صورة مرفقة فاعتبر محتوى الصورة دليلًا أساسيًا على الشيء المطلوب، ولا تضف خدمة غير مرتبطة بما يظهر في الصورة لمجرد وجود تشابه ضعيف في الكلمات. إذا كانت الصورة تظهر دواء أو علبة دواء أو وصفة دوائية وكان الطلب هو الشراء أو الإحضار، فاختر خدمة شراء وإحضار الدواء (pharmacy-purchase) إن كانت موجودة في الكتالوج. لا تستنتج عامل بناء أو صيانة أو خدمة أخرى من صورة دواء. إذا لم يذكر النص بوضوح أكثر من حاجة مستقلة، أعد خدمة واحدة فقط حتى لو وجدت خدمات مشابهة في الكتالوج. لا تعتبر كلمات واجهة مثل بحث أو اقتراح دليلًا على طلب مركب. أعد أكثر من معرف فقط عندما يذكر العميل صراحة حاجتين أو أكثر مستقلتين. إذا كان غير واضح أعد قائمة فارغة. أعد JSON فقط بالشكل: {"serviceIds":["id"],"confidence":0.0}. افهم العربية والفصحى واللهجة اليمنية والسياق مثل القرية والمدينة والشراء والإحضار والنقل والإصلاح والحصاد والحرث.`;
        const userContent = [{ type: 'text', text: `الطلب: ${text}\nالكتالوج:\n${JSON.stringify(catalog)}` }];
        if (ctx.image)
            userContent.push({ type: 'image_url', image_url: { url: `data:${ctx.image.mime};base64,${ctx.image.dataBase64}` } });
        const body = {
            model: this.config.aiIntentModel,
            temperature: 0,
            max_tokens: 250,
            response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
        };
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('AI intent timeout')), this.config.aiIntentTimeoutMs));
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.aiIntentKey}` };
        const res = await Promise.race([fetch(this.config.aiIntentUrl, { method: 'POST', headers, body: JSON.stringify(body) }), timeout]);
        if (!res.ok)
            throw new Error(`AI intent HTTP ${res.status}`);
        const j = await res.json();
        const content = j?.choices?.[0]?.message?.content;
        if (typeof content !== 'string')
            throw new Error('AI intent response missing content');
        const parsed = JSON.parse(content);
        return {
            serviceIds: Array.isArray(parsed.serviceIds) ? parsed.serviceIds.filter((x) => typeof x === 'string').slice(0, 5) : [],
            confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        };
    }
    async parse(text, ctx) {
        const base = deterministic(text, ctx);
        if (!this.shouldAskAi(base, Boolean(ctx.image)))
            return base;
        try {
            const ai = await this.callAi(text, ctx);
            this.failures = 0;
            this.circuitOpenUntil = 0;
            if (!ai)
                return { ...base, source: 'RULES_AI_FALLBACK' };
            const byId = new Map(ctx.catalog.all().services.filter(s => s.is_active).map(s => [s.id, s]));
            const cats = new Map(ctx.catalog.all().categories.filter(c => c.is_active).map(c => [c.id, c]));
            // When an image is present and the customer did not explicitly ask for
            // multiple independent needs, trust the visual AI result as a single intent.
            // This prevents unrelated catalog matches (e.g. construction worker) from
            // leaking into a medicine-photo request.
            const aiServiceIds = ctx.image && !base.extracted.compound ? ai.serviceIds.slice(0, 1) : ai.serviceIds;
            const aiMatches = aiServiceIds.map(id => {
                const svc = byId.get(id);
                const cat = svc ? cats.get(svc.category_id) : undefined;
                if (!svc || !cat)
                    return null;
                return { serviceId: svc.id, serviceSlug: svc.slug, serviceName: tr(svc.name_i18n, ctx.locale || 'ar'), categoryId: cat.id, categorySlug: cat.slug, categoryName: tr(cat.name_i18n, ctx.locale || 'ar'), score: Math.max(1, ai.confidence * 10), confidence: Math.max(ai.confidence, 0.55), icon: svc.icon };
            }).filter(Boolean);
            if (!aiMatches.length)
                return { ...base, source: 'RULES_AI_FALLBACK' };
            const ids = new Set(aiMatches.map(m => m.serviceId));
            // With an image, visual AI is authoritative. Do not merge unrelated local
            // text matches into the result (e.g. construction worker + medicine photo).
            const merged = ctx.image
                ? aiMatches.slice(0, 6)
                : [...aiMatches, ...base.matches.filter(m => !ids.has(m.serviceId))].slice(0, 6);
            const steps = aiMatches.slice(0, 3).map(m => ({ serviceId: m.serviceId, serviceSlug: m.serviceSlug, serviceName: m.serviceName, reason: ctx.image ? 'يتوافق مع محتوى الصورة والطلب' : 'اقتراح المساعد الذكي', confidence: m.confidence }));
            return { ...base, matches: merged, clarification: null, extracted: { ...base.extracted, compound: ctx.image ? aiMatches.length > 1 : aiMatches.length > 1 }, steps, source: 'AI' };
        }
        catch {
            this.failures += 1;
            if (this.failures >= 3)
                this.circuitOpenUntil = Date.now() + this.config.aiIntentCircuitCooldownMs;
            return { ...base, source: 'RULES_AI_FALLBACK' };
        }
    }
}
export { deterministic as keywordIntentParse };
//# sourceMappingURL=intent.js.map