import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(import.meta.dirname, '..');

function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let val = m[2] as string;
    if (/^(".*"|'.*')$/.test(val)) val = val.slice(1, -1);
    if (process.env[m[1] as string] === undefined) process.env[m[1] as string] = val;
  }
}

const bool = (v: string | undefined, d = false): boolean => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const int = (v: string | undefined, d: number): number => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export interface AdminSeed { name: string; phone: string; email: string; password: string }
export interface Config {
  env: string; isProd: boolean; port: number; dbPath: string; uploadDir: string; jwtSecret: string;
  accessTtlSec: number; refreshTtlDays: number; cookieSecure: boolean; trustProxy: boolean; corsOrigins: string[];
  mapProvider: string; routingUrl: string; routingTimeoutMs: number; assignmentTickMs: number; logLevel: string; disableScheduler: boolean; disableRateLimit: boolean;
  admin: AdminSeed; publicDir: string; sharedDir: string; root: string;
}
export interface ConfigOverrides { [key: string]: string | boolean | undefined; __skipDotEnv?: boolean }
/** اسم بديل لنفس النوع (يُستخدم في بعض الوحدات) — نفس الشكل تمامًا. */
export type EnvOverrides = ConfigOverrides;

/** يبني الإعدادات من البيئة. `overrides` تُستخدم في الاختبارات. */
export function loadConfig(overrides: ConfigOverrides = {}): Config {
  if (!overrides.__skipDotEnv) loadDotEnv(path.join(ROOT, '.env'));
  const env = { ...process.env, ...overrides } as Record<string, string | undefined>;
  const isProd = env.NODE_ENV === 'production';
  if (isProd && !env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD is required in production');
  let jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProd) throw new Error('JWT_SECRET is required in production (min 32 chars)');
    jwtSecret = crypto.randomBytes(32).toString('hex'); // تطوير: يتغير مع كل تشغيل
  }
  if (isProd && jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  const abs = (p: string) => (p === ':memory:' ? p : path.resolve(ROOT, p));
  return Object.freeze({
    env: env.NODE_ENV || 'development',
    isProd,
    port: int(env.PORT, 3000),
    dbPath: abs(env.DB_PATH || './data/khadamat.db'),
    uploadDir: abs(env.UPLOAD_DIR || './data/uploads'),
    jwtSecret,
    accessTtlSec: int(env.ACCESS_TTL_SEC, 900),
    refreshTtlDays: int(env.REFRESH_TTL_DAYS, 30),
    cookieSecure: bool(env.COOKIE_SECURE, isProd),
    trustProxy: bool(env.TRUST_PROXY, false),
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    mapProvider: env.MAP_PROVIDER || 'leaflet-osm',
    routingUrl: env.ROUTING_URL || 'https://router.project-osrm.org',
    routingTimeoutMs: int(env.ROUTING_TIMEOUT_MS, 8000),
    assignmentTickMs: int(env.ASSIGNMENT_TICK_MS, 15000),
    logLevel: env.LOG_LEVEL || 'info',
    disableScheduler: bool(env.DISABLE_SCHEDULER, false),
    disableRateLimit: bool(env.DISABLE_RATE_LIMIT, false),
    admin: {
      name: env.ADMIN_NAME || 'مدير النظام',
      phone: env.ADMIN_PHONE || '+967700000000',
      email: env.ADMIN_EMAIL || 'admin@khadamat.local',
      password: env.ADMIN_PASSWORD || 'Admin12345',
    },
    publicDir: path.join(ROOT, 'public'),
    sharedDir: path.join(ROOT, 'shared'),
    root: ROOT,
  });
}
