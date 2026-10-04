import { normalizeAr, tr, parseJson } from '../core/util.js';
import type { Locale, ServiceRow, CategoryRow } from '../types/domain.js';
import type { Catalog } from '../modules/catalog.js';
import type { Config } from '../config.js';

export interface IntentMatch { serviceId: string; serviceSlug: string; serviceName: string; categoryId: string; categorySlug: string; categoryName: string; score: number; confidence: number; icon: string | null }
export interface IntentStep { serviceId: string; serviceSlug: string; serviceName: string; reason: string; confidence: number }
export interface IntentResult {
  matches: IntentMatch[];
  priority: 'LOW' | 'NORMAL' | 'URGENT';
  extracted: { urgent: boolean; when: 'today' | 'now' | null; destinationHint: 'CITY_TO_VILLAGE' | 'VILLAGE_TO_CITY' | null; purchaseIntent: boolean; compound: boolean };
  steps: IntentStep[];
  clarification: { question: string; options: Array<{ label: string; serviceId: string }> } | null;
  source: 'RULES' | 'AI' | 'RULES_AI_FALLBACK';
}
export interface IntentParser { parse(text: string, ctx: { catalog: Catalog; locale?: Locale; image?: { mime: string; dataBase64: string } }): Promise<IntentResult> }

const URGENT = ['اليوم','الان','حالا','فورا','بسرعه','مستعجل','عاجل','ضروري','طارئ','سريع','urgent','asap','now','today'].map(normalizeAr);
const stripPrefix = (w: string): string => w.replace(/^(وال|بال|كال|فال|لل|ال)/, '').replace(/^و(?=.{4,})/, '');
const VILLAGE = ['قرية','ريف','مزرعة','عزلة','منطقة','القرية','المزرعة','الريف'].map(normalizeAr);
const CITY = ['مدينة','المدينة','المدينه','السوق','المركز','إب','صنعاء','تعز','عدن'].map(normalizeAr);
const PURCHASE = ['اشتر','اشتري','يشتري','شراء','جيب','يجيب','احضر','يحضر','غرض','دواء','صيدلية','سوق'].map(normalizeAr);
const tokenize = (norm:string) => norm.split(/\s+/).filter(Boolean).flatMap(w => [w, stripPrefix(w)]).filter(w=>w.length>=2);

function deterministic(text: string, { catalog, locale='ar' }: { catalog: Catalog; locale?: Locale }): IntentResult {
  const norm = normalizeAr(text);
  const tokens = tokenize(norm), tokenSet = new Set(tokens), data = catalog.all();
  const activeCats = new Map(data.categories.filter(c=>c.is_active).map(c=>[c.id,c]));
  const matches:Array<{svc:ServiceRow;cat:CategoryRow;score:number}> = [];
  for(const svc of data.services){
    const cat=activeCats.get(svc.category_id);
    if(!svc.is_active||!cat||!catalog.getActiveService(svc.id)) continue;
    const terms=new Set<string>();
    for(const k of parseJson<string[]>(svc.keywords,[])||[]) terms.add(normalizeAr(k));
    for(const lang of ['ar','en'] as const) terms.add(normalizeAr(tr(svc.name_i18n,lang)));
    let score=0;
    for(const term of terms){
      if(!term) continue;
      if(term.includes(' ')){if(norm.includes(term)) score+=4+term.split(' ').length; continue;}
      if(tokenSet.has(term)) score+=3;
      else if(term.length>=3 && tokens.some(t=>t.length>=3&&(t.startsWith(term)||term.startsWith(t)))) score+=1.5;
    }
    for(const k of parseJson<string[]>(cat.keywords,[])||[]){const kk=normalizeAr(k);if(kk&&(tokenSet.has(kk)||norm.includes(kk)))score+=0.75;}
    if(score>0)matches.push({svc,cat,score});
  }
  matches.sort((a,b)=>b.score-a.score);
  const top:IntentMatch[]=matches.slice(0,6).map(({svc,cat,score})=>({serviceId:svc.id,serviceSlug:svc.slug,serviceName:tr(svc.name_i18n,locale),categoryId:cat.id,categorySlug:cat.slug,categoryName:tr(cat.name_i18n,locale),score,confidence:Math.min(1,Math.round((score/6)*100)/100),icon:svc.icon}));
  const urgent=URGENT.some(u=>tokenSet.has(u));
  const purchaseIntent=PURCHASE.some(u=>norm.includes(u)||tokenSet.has(u));
  const hasVillage=VILLAGE.some(u=>tokenSet.has(u)||norm.includes(u)); const hasCity=CITY.some(u=>tokenSet.has(u)||norm.includes(u));
  const cityToVillage=/(?:من|في) المدينه.*(?:للقريه|لريف|للمزرعه|الى القريه|الى الريف|الى المزرعه)/.test(norm);
  const villageToCity=/(?:من|في) (?:القريه|الريف|المزرعه).*?(?:للمدينه|الى المدينه|للسوق|الى السوق|للمركز|الى المركز)/.test(norm);
  const destinationHint = cityToVillage ? 'CITY_TO_VILLAGE' : villageToCity ? 'VILLAGE_TO_CITY' : null;
  const unique=[] as IntentStep[];
  for(const m of top){
    const reason = purchaseIntent && /purchase|pharmacy|shopping/.test(m.serviceSlug) ? 'يتوافق مع طلب الشراء أو الإحضار' : destinationHint ? 'يتوافق مع مسار المدينة والقرية' : 'يتوافق مع كلمات الطلب';
    if(!unique.some(x=>x.serviceId===m.serviceId)) unique.push({serviceId:m.serviceId,serviceSlug:m.serviceSlug,serviceName:m.serviceName,reason,confidence:m.confidence});
  }
  const steps=unique.slice(0,3);
  let clarification:null|IntentResult['clarification']=null;
  if(top.length===0 || top[0].confidence<0.40){
    const custom=data.services.find(x=>x.slug==='custom-request');
    const opts=top.slice(0,3).map(x=>({label:x.serviceName,serviceId:x.serviceId}));
    if(opts.length) clarification={question:'ماذا تريد تحديدًا؟',options:opts};
    else if(custom) clarification={question:'ما أقرب شيء لما تحتاجه؟',options:[{label:'طلب خاص',serviceId:custom.id}]};
  } else if(top.length>1 && top[0].confidence<0.68 && (top[0].confidence-top[1].confidence)<0.12){
    clarification={question:'ماذا تقصد أكثر؟',options:top.slice(0,3).map(x=>({label:x.serviceName,serviceId:x.serviceId}))};
  }
  const best=data.byService.get(top[0]?.serviceId||'');
  return {matches:top,priority:urgent?'URGENT':(best?.default_priority||'NORMAL'),extracted:{urgent,when:/اليوم|today/.test(norm)?'today':/الان|حالا|فورا|now/.test(norm)?'now':null,destinationHint,purchaseIntent,compound:steps.length>1||/(?:\sو\p{L}|^و\s|\sو$|ثم|بعدها|مع)/u.test(norm)&&purchaseIntent},steps,clarification,source:'RULES'};
}

export class HybridIntentParser implements IntentParser {
  private failures = 0;
  private circuitOpenUntil = 0;
  constructor(private readonly config: Config) {}

  private shouldAskAi(base: IntentResult): boolean {
    if (!this.config.aiIntentAuto || !this.config.aiIntentUrl || !this.config.aiIntentKey) return false;
    if (Date.now() < this.circuitOpenUntil) return false;
    // Clear, single-intent requests do not need a network round-trip.
    // AI is invoked automatically when the local parser signals ambiguity or a compound request.
    return base.clarification !== null || base.extracted.compound || (base.matches[0]?.confidence ?? 0) < 0.58;
  }

  private async callAi(text: string, ctx: { catalog: Catalog; locale?: Locale; image?: { mime: string; dataBase64: string } }): Promise<{ serviceIds: string[]; confidence: number } | null> {
    const locale = ctx.locale || 'ar';
    const catalog = ctx.catalog.all().services.filter(s => s.is_active).map(s => ({
      id: s.id,
      slug: s.slug,
      name: tr(s.name_i18n, locale),
      keywords: parseJson<string[]>(s.keywords, []) || [],
    }));
    const system = `أنت محلل نية داخل تطبيق خدمات يمني. مهمتك تحديد الخدمة أو الخدمات الموجودة فعلًا في الكتالوج من طلب العميل. لا تخترع خدمة أو معرفًا غير موجود. إذا كان الطلب مركبًا أعد أكثر من معرف بالترتيب. إذا كان غير واضح أعد قائمة فارغة. أعد JSON فقط بالشكل: {"serviceIds":["id"],"confidence":0.0}. افهم العربية والفصحى واللهجة اليمنية والسياق مثل القرية والمدينة والشراء والإحضار والنقل والإصلاح والحصاد والحرث.`;
    const userContent: any[] = [{ type: 'text', text: `الطلب: ${text}\nالكتالوج:\n${JSON.stringify(catalog)}` }];
    if (ctx.image) userContent.push({ type: 'image_url', image_url: { url: `data:${ctx.image.mime};base64,${ctx.image.dataBase64}` } });
    const body = {
      model: this.config.aiIntentModel,
      temperature: 0,
      max_tokens: 250,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
    };
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI intent timeout')), this.config.aiIntentTimeoutMs));
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.aiIntentKey}` };
    const res = await Promise.race([fetch(this.config.aiIntentUrl!, { method: 'POST', headers, body: JSON.stringify(body) }), timeout]);
    if (!res.ok) throw new Error(`AI intent HTTP ${res.status}`);
    const j = await res.json() as any;
    const content = j?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('AI intent response missing content');
    const parsed = JSON.parse(content);
    return {
      serviceIds: Array.isArray(parsed.serviceIds) ? parsed.serviceIds.filter((x: any) => typeof x === 'string').slice(0, 5) : [],
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    };
  }

  async parse(text:string, ctx:{catalog:Catalog;locale?:Locale;image?:{mime:string;dataBase64:string}}):Promise<IntentResult>{
    const base=deterministic(text,ctx);
    if (!this.shouldAskAi(base)) return base;
    try {
      const ai = await this.callAi(text, ctx);
      this.failures = 0;
      this.circuitOpenUntil = 0;
      if (!ai) return {...base,source:'RULES_AI_FALLBACK'};
      const byId = new Map(ctx.catalog.all().services.filter(s => s.is_active).map(s => [s.id, s]));
      const cats = new Map(ctx.catalog.all().categories.filter(c => c.is_active).map(c => [c.id, c]));
      const aiMatches: IntentMatch[] = ai.serviceIds.map(id => {
        const svc = byId.get(id); const cat = svc ? cats.get(svc.category_id) : undefined;
        if (!svc || !cat) return null;
        return { serviceId:svc.id,serviceSlug:svc.slug,serviceName:tr(svc.name_i18n,ctx.locale||'ar'),categoryId:cat.id,categorySlug:cat.slug,categoryName:tr(cat.name_i18n,ctx.locale||'ar'),score:Math.max(1,ai.confidence*10),confidence:Math.max(ai.confidence,0.55),icon:svc.icon };
      }).filter(Boolean) as IntentMatch[];
      if (!aiMatches.length) return {...base,source:'RULES_AI_FALLBACK'};
      const ids = new Set(aiMatches.map(m=>m.serviceId));
      const merged = [...aiMatches, ...base.matches.filter(m=>!ids.has(m.serviceId))].slice(0,6);
      const steps = aiMatches.slice(0,3).map(m=>({serviceId:m.serviceId,serviceSlug:m.serviceSlug,serviceName:m.serviceName,reason:'اقتراح المساعد الذكي',confidence:m.confidence}));
      return {...base,matches:merged,clarification:null,steps,source:'AI'};
    } catch {
      this.failures += 1;
      if (this.failures >= 3) this.circuitOpenUntil = Date.now() + this.config.aiIntentCircuitCooldownMs;
      return {...base,source:'RULES_AI_FALLBACK'};
    }
  }
}

export { deterministic as keywordIntentParse };
