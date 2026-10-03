import { s, parse, type Schema } from '../core/validate.js';
import { E } from '../core/errors.js';
import { uuid } from '../core/security.js';
import { haversineKm, iso } from '../core/util.js';
import { auth, roles } from './auth.middleware.js';
import type { App } from '../app.js';
import type { Ctx, Router } from '../core/http.js';
import type { LocationRow, OrderRow } from '../types/domain.js';

const tripLocation: Schema = s.obj({
  lat: s.num({ min: -90, max: 90 }),
  lng: s.num({ min: -180, max: 180 }),
  accuracy: s.num({ min: 0, max: 100000, optional: true }),
  addressText: s.str({ max: 300, optional: true }),
  source: s.oneOf(['gps', 'map', 'manual'], { optional: true, default: 'map' }),
});
const purposeSchema = s.oneOf(['PASSENGER', 'ITEM_PURCHASE', 'MEDICINE', 'PARCEL', 'OTHER']);
const tripInputSchema: Schema = s.obj({
  origin: tripLocation,
  destination: tripLocation,
  originAddressId: s.str({ max: 64, optional: true }),
  destinationAddressId: s.str({ max: 64, optional: true }),
  purpose: purposeSchema,
  purposeNote: s.str({ max: 500, optional: true }),
  description: s.str({ min: 5, max: 1000 }),
  contactPhone: s.str({ min: 8, max: 24 }),
  notes: s.str({ max: 500, optional: true }),
});

type Purpose = 'PASSENGER' | 'ITEM_PURCHASE' | 'MEDICINE' | 'PARCEL' | 'OTHER';


interface RouteDistance {
  distanceKm: number;
  durationMin: number | null;
  method: 'ROAD_ROUTING' | 'STRAIGHT_LINE_TEST';
}

async function drivingDistance(app: App, origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<RouteDistance> {
  const baseUrl = app.config.routingUrl.replace(/\/$/, '');
  if (baseUrl === 'mock://straight-line') {
    return { distanceKm: Math.round(haversineKm(origin.lat, origin.lng, destination.lat, destination.lng) * 10) / 10, durationMin: null, method: 'STRAIGHT_LINE_TEST' };
  }
  const timer = setTimeout(() => {}, app.config.routingTimeoutMs);
  try {
    const url = `${baseUrl}/route/v1/driving/${encodeURIComponent(origin.lng)},${encodeURIComponent(origin.lat)};${encodeURIComponent(destination.lng)},${encodeURIComponent(destination.lat)}?overview=false&steps=false`;
    const response = await Promise.race([
      fetch(url, { headers: { accept: 'application/json' } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ROUTING_TIMEOUT')), app.config.routingTimeoutMs)),
    ]);
    if (!response.ok) throw E.serviceUnavailable('تعذر الوصول إلى خدمة حساب مسافة القيادة حاليًا', 'ROUTING_UNAVAILABLE');
    const data = await response.json() as any;
    const route = data?.routes?.[0];
    if (data?.code !== 'Ok' || !route || !Number.isFinite(route.distance) || route.distance <= 0) {
      throw E.unprocessable('تعذر العثور على طريق قيادة بين الموقعين', 'ROUTE_NOT_FOUND');
    }
    const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
    const durationMin = Number.isFinite(route.duration) ? Math.round((route.duration / 60) * 10) / 10 : null;
    return { distanceKm, durationMin, method: 'ROAD_ROUTING' };
  } catch (err) {
    if ((err as any)?.code) throw err;
    if ((err as any)?.message === 'ROUTING_TIMEOUT') throw E.serviceUnavailable('انتهت مهلة حساب مسافة القيادة، حاول مرة أخرى', 'ROUTING_TIMEOUT');
    throw E.serviceUnavailable('تعذر حساب مسافة القيادة حاليًا، حاول مرة أخرى', 'ROUTING_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

function price(app: App, distanceKm: number) {
  const base = app.settings.get<number>('trips.base_fare');
  const perKm = app.settings.get<number>('trips.per_km_fare');
  const minimum = app.settings.get<number>('trips.minimum_fare');
  const fare = Math.max(minimum, base + distanceKm * perKm);
  return { baseFare: base, perKmFare: perKm, minimumFare: minimum, fare: Math.round(fare / 50) * 50, currency: app.settings.get<string>('platform.currency') };
}

function resolveSaved(db: App['db'], userId: string, id?: string): LocationRow | null {
  if (!id) return null;
  const a = db.get<{ location_id: string }>('SELECT location_id FROM addresses WHERE id=? AND user_id=?', id, userId);
  if (!a) throw E.unprocessable('العنوان المحفوظ غير موجود', 'INVALID_ADDRESS');
  return db.get<LocationRow>('SELECT * FROM locations WHERE id=?', a.location_id) || null;
}

function makeLocation(app: App, userId: string, input: any, addressId?: string): LocationRow {
  const saved = resolveSaved(app.db, userId, addressId);
  return saved || app.locations.create(input, { requireArea: false });
}

export function registerTripRoutes(app: App, r: Router): void {
  r.post('/trips/estimate', auth, roles('CUSTOMER'), async (ctx: Ctx) => {
    if (!app.settings.get<boolean>('trips.enabled')) throw E.unprocessable('نظام المشاوير غير متاح حاليًا', 'TRIPS_DISABLED');
    const b = parse<any>(s.obj({ origin: tripLocation, destination: tripLocation }), ctx.body);
    if (b.origin.lat === b.destination.lat && b.origin.lng === b.destination.lng) throw E.unprocessable('حدد وجهة مختلفة عن موقع الانطلاق', 'SAME_LOCATION');
    const route = await drivingDistance(app, b.origin, b.destination);
    return { distanceKm: route.distanceKm, durationMin: route.durationMin, ...price(app, route.distanceKm), method: route.method, note: 'المسافة محسوبة حسب مسار القيادة على الطرق، وليست خطًا مستقيمًا بين النقطتين.' };
  });

  r.post('/trips', auth, roles('CUSTOMER'), async (ctx: Ctx) => {
    if (!app.settings.get<boolean>('trips.enabled')) throw E.unprocessable('نظام المشاوير غير متاح حاليًا', 'TRIPS_DISABLED');
    const tripService = app.catalog.all().services.find(x => x.slug === 'motorcycle-trips');
    if (!tripService || !tripService.is_active) throw E.notFound('خدمة المشاوير غير متاحة', 'SERVICE_NOT_FOUND');
    const b = parse<any>(tripInputSchema, ctx.body);
    const origin = makeLocation(app, ctx.user!.id, b.origin, b.originAddressId);
    const destination = makeLocation(app, ctx.user!.id, b.destination, b.destinationAddressId);
    if (origin.lat === destination.lat && origin.lng === destination.lng) throw E.unprocessable('حدد وجهة مختلفة عن موقع الانطلاق', 'SAME_LOCATION');
    const route = await drivingDistance(app, origin, destination);
    const distanceKm = route.distanceKm;
    if (distanceKm <= 0) throw E.unprocessable('تعذر حساب مسافة القيادة بين الموقعين', 'INVALID_DISTANCE');
    const pricing = price(app, distanceKm);
    const now = iso(app.clock.now());
    return app.db.tx(() => {
      const activeCount = app.db.get<{c:number}>(`SELECT COUNT(*) c FROM orders WHERE customer_id=? AND status IN ('PENDING','SEARCHING','ASSIGNED','ACCEPTED','ON_THE_WAY','IN_PROGRESS')`, ctx.user!.id)!.c;
      if (activeCount >= app.settings.get<number>('orders.max_active_per_customer')) throw E.unprocessable('لديك عدد كبير من الطلبات النشطة حاليًا', 'TOO_MANY_ACTIVE_ORDERS');
      const id = uuid();
      const code = (() => { const year = new Date(app.clock.now()).getUTCFullYear(); const key=`order_seq_${year}`; app.db.run('INSERT INTO counters(name,value) VALUES(?,1) ON CONFLICT(name) DO UPDATE SET value=value+1',key); const n=app.db.get<{value:number}>('SELECT value FROM counters WHERE name=?',key)!.value; return `KH-${year}-${String(n).padStart(6,'0')}`; })();
      app.db.run(`INSERT INTO orders(id,code,customer_id,service_id,status,priority,description,form_data,location_id,area_id,contact_phone,scheduled_at,pricing_type,price_snapshot,agreed_price,currency,customer_notes,attachments,created_at,updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, code, ctx.user!.id, tripService.id, 'PENDING', 'NORMAL', b.description,
        JSON.stringify({ purpose:b.purpose, purposeNote:b.purposeNote || null, originAddressText:b.origin.addressText || null, destinationAddressText:b.destination.addressText || null }), origin.id, origin.area_id,
        b.contactPhone, null, 'FIXED', pricing.fare, null, pricing.currency, b.notes || null, '[]', now, now);
      app.db.run(`INSERT INTO trip_orders(order_id,destination_location_id,purpose,purpose_note,distance_km,base_fare,per_km_fare,minimum_fare,fare,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, destination.id, b.purpose as Purpose, b.purposeNote || null, distanceKm, pricing.baseFare, pricing.perKmFare, pricing.minimumFare, pricing.fare, pricing.currency, now, now);
      app.db.run('INSERT INTO order_status_history(order_id,from_status,to_status,changed_by,actor_role,created_at) VALUES (?,?,?,?,?,?)', id, null, 'PENDING', ctx.user!.id, 'CUSTOMER', now);
      let o = app.db.get<OrderRow>('SELECT * FROM orders WHERE id=?', id)!;
      o = app.orders.applyTransition(o, 'SEARCHING', 'SYSTEM', ctx, { reason:'trip-auto' });
      app.notifications.notify(ctx.user!.id, 'ORDER_RECEIVED', { code:o.code });
      app.assignment.assignWave(o.id);
      o = app.db.get<OrderRow>('SELECT * FROM orders WHERE id=?', id)!;
      ctx.status=201;
      return { order: app.orders.serialize(o, ctx), trip: serializeTrip(app, o.id, ctx.locale) };
    });
  });
}

export function serializeTrip(app: App, orderId: string, locale: 'ar'|'en' = 'ar') {
  const t = app.db.get<any>('SELECT * FROM trip_orders WHERE order_id=?', orderId);
  if (!t) return null;
  const d = app.db.get<LocationRow>('SELECT * FROM locations WHERE id=?', t.destination_location_id);
  if (!d) return null;
  const labels: Record<string,string> = { PASSENGER:'نقل شخص', ITEM_PURCHASE:'شراء وإحضار غرض', MEDICINE:'شراء دواء من صيدلية', PARCEL:'توصيل غرض', OTHER:'آخر' };
  return { purpose:t.purpose, purposeName: labels[t.purpose] || t.purpose, purposeNote:t.purpose_note, distanceKm:t.distance_km, fare:t.fare, currency:t.currency, pricing:{baseFare:t.base_fare,perKmFare:t.per_km_fare,minimumFare:t.minimum_fare}, destination:app.locations.serialize(d, locale) };
}
