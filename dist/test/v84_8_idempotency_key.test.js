import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/core/errors.js';
import { readIdempotencyKey } from '../src/core/idempotency.js';
test('V84.8: مفتاح منع التكرار يقبل القيم المعتادة ويزيل الفراغات الطرفية', () => {
    assert.equal(readIdempotencyKey(undefined), null);
    assert.equal(readIdempotencyKey(null), null);
    assert.equal(readIdempotencyKey('   '), null);
    assert.equal(readIdempotencyKey('  order-123:retry.1  '), 'order-123:retry.1');
    assert.equal(readIdempotencyKey('مفتاح-طلب-١'), 'مفتاح-طلب-١');
    assert.equal(readIdempotencyKey('x'.repeat(128)), 'x'.repeat(128));
});
test('V84.8: مفتاح منع التكرار يرفض القيم الطويلة ومحارف التحكم وأنواع القيم غير النصية', () => {
    for (const value of ['x'.repeat(129), 'bad\nkey', 'bad\u0000key', ['one', 'two'], 42]) {
        assert.throws(() => readIdempotencyKey(value), (error) => {
            if (!(error instanceof AppError))
                return false;
            assert.equal(error.status, 422);
            assert.equal(error.code, 'INVALID_IDEMPOTENCY_KEY');
            return true;
        });
    }
});
//# sourceMappingURL=v84_8_idempotency_key.test.js.map