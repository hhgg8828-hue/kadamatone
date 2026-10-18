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
const strictInt = (v: string | undefined, d: number): number => (v === undefined || v.trim() === '' ? d : Number(v));

export interface AdminSeed { name: string; phone: string; email: string; password: string }
export interface Config {
  env: string; isProd: boolean; port: number; dbPath: string; uploadDir: string; jwtSecret: string;
  accessTtlSec: number; refreshTtlDays: number; cookieSecure: boolean; trustProxy: boolean; corsOrigins: string[];
  mapProvider: string; routingUrl: string; routingTimeoutMs: number; assignmentTickMs: number; logLevel: string; disableScheduler: boolean; disableRateLimit: boolean; aiIntentUrl: string | null; aiIntentKey: string | null; aiIntentModel: string; aiIntentTimeoutMs: number; aiIntentAuto: boolean; aiIntentCircuitCooldownMs: number;
  whatsappAccessToken: string | null; whatsappPhoneNumberId: string | null; whatsappGraphVersion: string; whatsappOtpTemplate: string; whatsappOtpLanguage: string; whatsappOtpEnabled: boolean;
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
  if (isProd && env.ADMIN_PASSWORD) {
    const password = env.ADMIN_PASSWORD;
    const characterClasses = [/[a-z]/.test(password), /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
    if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters in production');
    if (characterClasses < 3) throw new Error('ADMIN_PASSWORD must use at least 3 character classes in production');
    if (/^(replace[-_ ]?with|change[-_ ]?me|password|admin123|letmein)/i.test(password)) {
      throw new Error('ADMIN_PASSWORD appears to be a placeholder or common password');
    }
  }
  if (isProd && env.COOKIE_SECURE !== undefined && !bool(env.COOKIE_SECURE, true)) {
    throw new Error('COOKIE_SECURE must be true in production');
  }
  let jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProd) throw new Error('JWT_SECRET is required in production (min 32 chars)');
    jwtSecret = crypto.randomBytes(32).toString('hex'); // تطوير: يتغير مع كل تشغيل
  }
  if (!jwtSecret) throw new Error('JWT_SECRET could not be initialized');
  if (isProd && jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  const whatsappOtpEnabled = bool(env.WHATSAPP_OTP_ENABLED, false);
  const whatsappAccessToken = env.WHATSAPP_ACCESS_TOKEN || null;
  const whatsappPhoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID || null;
  if (isProd && whatsappOtpEnabled && (!whatsappAccessToken || !whatsappPhoneNumberId)) {
    throw new Error('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required when WHATSAPP_OTP_ENABLED=true in production');
  }
  const port = strictInt(env.PORT, 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  const accessTtlSec = strictInt(env.ACCESS_TTL_SEC, 900);
  if (!Number.isInteger(accessTtlSec) || accessTtlSec < 1) throw new Error('ACCESS_TTL_SEC must be a positive integer');
  const refreshTtlDays = strictInt(env.REFRESH_TTL_DAYS, 30);
  if (!Number.isInteger(refreshTtlDays) || refreshTtlDays < 1) throw new Error('REFRESH_TTL_DAYS must be a positive integer');
  const abs = (p: string) => (p === ':memory:' ? p : path.resolve(ROOT, p));
  return Object.freeze({
    env: env.NODE_ENV || 'development',
    isProd,
    port,
    dbPath: abs(env.DB_PATH || './data/khadamat.db'),
    uploadDir: abs(env.UPLOAD_DIR || './data/uploads'),
    jwtSecret,
    accessTtlSec,
    refreshTtlDays,
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
    aiIntentUrl: env.AI_INTENT_URL || (env.OPENAI_API_KEY ? 'https://api.openai.com/v1/chat/completions' : null),
    aiIntentKey: env.AI_INTENT_KEY || env.OPENAI_API_KEY || null,
    aiIntentModel: env.AI_INTENT_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini',
    aiIntentTimeoutMs: int(env.AI_INTENT_TIMEOUT_MS, 1800),
    aiIntentAuto: bool(env.AI_INTENT_AUTO, true),
    aiIntentCircuitCooldownMs: int(env.AI_INTENT_CIRCUIT_COOLDOWN_MS, 30000),
    whatsappAccessToken,
    whatsappPhoneNumberId,
    whatsappGraphVersion: env.WHATSAPP_GRAPH_VERSION || 'v23.0',
    whatsappOtpTemplate: env.WHATSAPP_OTP_TEMPLATE || 'khadamat_otp',
    whatsappOtpLanguage: env.WHATSAPP_OTP_LANGUAGE || 'ar',
    whatsappOtpEnabled,
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
