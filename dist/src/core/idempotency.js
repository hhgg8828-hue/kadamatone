import { E } from './errors.js';
/**
 * Normalize and bound client-supplied idempotency keys before they reach
 * persistent storage. Empty/whitespace-only keys mean "no idempotency key".
 * We intentionally allow printable Unicode so clients are not coupled to a
 * UUID format, but reject control characters and oversized values.
 */
export function readIdempotencyKey(value) {
    if (value === undefined || value === null)
        return null;
    if (typeof value !== 'string') {
        throw E.unprocessable('مفتاح منع التكرار غير صالح', 'INVALID_IDEMPOTENCY_KEY');
    }
    const key = value.trim();
    if (!key)
        return null;
    if (key.length > 128 || /[\u0000-\u001F\u007F]/u.test(key)) {
        throw E.unprocessable('مفتاح منع التكرار غير صالح؛ الحد الأقصى 128 حرفًا', 'INVALID_IDEMPOTENCY_KEY');
    }
    return key;
}
//# sourceMappingURL=idempotency.js.map