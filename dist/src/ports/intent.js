import { normalizeAr, tr, parseJson } from '../core/util.js';
const URGENT = ['اليوم', 'الان', 'حالا', 'فورا', 'بسرعه', 'مستعجل', 'عاجل', 'ضروري', 'طارئ', 'سريع', 'urgent', 'asap', 'now', 'today'].map(normalizeAr);
const stripPrefix = (w) => w.replace(/^(وال|بال|كال|فال|لل|ال)/, '').replace(/^و(?=.{4,})/, '');
export class KeywordIntentParser {
    parse(text, { catalog, locale = 'ar' }) {
        const norm = normalizeAr(text);
        const tokens = norm.split(' ').filter(Boolean).flatMap((w) => [w, stripPrefix(w)]).filter((w) => w.length >= 2);
        const tokenSet = new Set(tokens);
        const data = catalog.all();
        const activeCats = new Map(data.categories.filter((c) => c.is_active).map((c) => [c.id, c]));
        const matches = [];
        for (const svc of data.services) {
            const cat = activeCats.get(svc.category_id);
            if (!svc.is_active || !cat || !catalog.getActiveService(svc.id))
                continue;
            const terms = new Set();
            for (const k of parseJson(svc.keywords, []) ?? [])
                terms.add(normalizeAr(k));
            for (const lang of ['ar', 'en'])
                terms.add(normalizeAr(tr(svc.name_i18n, lang)));
            let score = 0;
            for (const term of terms) {
                if (!term)
                    continue;
                if (term.includes(' ')) {
                    if (norm.includes(term))
                        score += 3 + term.split(' ').length;
                    continue;
                }
                if (tokenSet.has(term))
                    score += 3;
                else if (term.length >= 3 && tokens.some((t) => t.length >= 3 && (t.startsWith(term) || term.startsWith(t))))
                    score += 1.5;
            }
            for (const k of parseJson(cat.keywords, []) ?? []) {
                const kk = normalizeAr(k);
                if (kk && (tokenSet.has(kk) || norm.includes(kk)))
                    score += 0.5;
            }
            if (score > 0)
                matches.push({ svc, cat, score });
        }
        matches.sort((a, b) => b.score - a.score);
        const top = matches.slice(0, 5).map(({ svc, cat, score }) => ({
            serviceId: svc.id, serviceSlug: svc.slug, serviceName: tr(svc.name_i18n, locale), categoryId: cat.id, categorySlug: cat.slug, categoryName: tr(cat.name_i18n, locale),
            score, confidence: Math.min(1, Math.round((score / 6) * 100) / 100), icon: svc.icon,
        }));
        const urgent = URGENT.some((u) => tokenSet.has(u) || (u.includes(' ') && norm.includes(u)));
        const best = top[0] ? data.byService.get(top[0].serviceId) : null;
        return { matches: top, priority: urgent ? 'URGENT' : (best?.default_priority || 'NORMAL'), extracted: { urgent, when: /اليوم|today/.test(norm) ? 'today' : /الان|حالا|فورا|now/.test(norm) ? 'now' : null } };
    }
}
//# sourceMappingURL=intent.js.map