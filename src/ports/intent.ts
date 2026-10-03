import { normalizeAr, tr, parseJson } from '../core/util.js';
import type { Locale, ServiceRow, CategoryRow } from '../types/domain.js';
import type { Catalog } from '../modules/catalog.js';

export interface IntentMatch { serviceId: string; serviceSlug: string; serviceName: string; categoryId: string; categorySlug: string; categoryName: string; score: number; confidence: number; icon: string | null }
export interface IntentResult { matches: IntentMatch[]; priority: 'LOW' | 'NORMAL' | 'URGENT'; extracted: { urgent: boolean; when: 'today' | 'now' | null } }
/**
 * Port: IntentParser.parse(text, {catalog}) → IntentResult
 * التنفيذ الافتراضي KeywordIntentParser لا يحتاج أي مزود AI. لاحقًا: LLMIntentParser بنفس الواجهة
 * (يُختار عبر app.intentParser) دون تغيير الواجهة الأمامية أو نقطة النهاية POST /search/intent.
 */
export interface IntentParser { parse(text: string, ctx: { catalog: Catalog; locale?: Locale }): IntentResult }

const URGENT = ['اليوم', 'الان', 'حالا', 'فورا', 'بسرعه', 'مستعجل', 'عاجل', 'ضروري', 'طارئ', 'سريع', 'urgent', 'asap', 'now', 'today'].map(normalizeAr);
const stripPrefix = (w: string): string => w.replace(/^(وال|بال|كال|فال|لل|ال)/, '').replace(/^و(?=.{4,})/, '');

export class KeywordIntentParser implements IntentParser {
  parse(text: string, { catalog, locale = 'ar' }: { catalog: Catalog; locale?: Locale }): IntentResult {
    const norm = normalizeAr(text);
    const tokens = norm.split(' ').filter(Boolean).flatMap((w) => [w, stripPrefix(w)]).filter((w) => w.length >= 2);
    const tokenSet = new Set(tokens);
    const data = catalog.all();
    const activeCats = new Map(data.categories.filter((c) => c.is_active).map((c) => [c.id, c]));
    const matches: Array<{ svc: ServiceRow; cat: CategoryRow; score: number }> = [];
    for (const svc of data.services) {
      const cat = activeCats.get(svc.category_id);
      if (!svc.is_active || !cat) continue;
      const terms = new Set<string>();
      for (const k of parseJson<string[]>(svc.keywords, []) ?? []) terms.add(normalizeAr(k));
      for (const lang of ['ar', 'en'] as const) terms.add(normalizeAr(tr(svc.name_i18n, lang)));
      let score = 0;
      for (const term of terms) {
        if (!term) continue;
        if (term.includes(' ')) { if (norm.includes(term)) score += 3 + term.split(' ').length; continue; }
        if (tokenSet.has(term)) score += 3;
        else if (term.length >= 3 && tokens.some((t) => t.length >= 3 && (t.startsWith(term) || term.startsWith(t)))) score += 1.5;
      }
      for (const k of parseJson<string[]>(cat.keywords, []) ?? []) { const kk = normalizeAr(k); if (kk && (tokenSet.has(kk) || norm.includes(kk))) score += 0.5; }
      if (score > 0) matches.push({ svc, cat, score });
    }
    matches.sort((a, b) => b.score - a.score);
    const top: IntentMatch[] = matches.slice(0, 5).map(({ svc, cat, score }) => ({
      serviceId: svc.id, serviceSlug: svc.slug, serviceName: tr(svc.name_i18n, locale), categoryId: cat.id, categorySlug: cat.slug, categoryName: tr(cat.name_i18n, locale),
      score, confidence: Math.min(1, Math.round((score / 6) * 100) / 100), icon: svc.icon,
    }));
    const urgent = URGENT.some((u) => tokenSet.has(u) || (u.includes(' ') && norm.includes(u)));
    const best = top[0] ? data.byService.get(top[0].serviceId) : null;
    return { matches: top, priority: urgent ? 'URGENT' : (best?.default_priority || 'NORMAL'), extracted: { urgent, when: /اليوم|today/.test(norm) ? 'today' : /الان|حالا|فورا|now/.test(norm) ? 'now' : null } };
  }
}
