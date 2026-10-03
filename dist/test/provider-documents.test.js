import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, uniquePhone, loginAdmin } from './helpers.js';
let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });
const jpeg1x1 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IY//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Qf//Z';
async function registerProvider() {
    const body = { fullName: 'مقدم وثائق', phone: uniquePhone(), password: 'Passw0rd123', role: 'PROVIDER', locale: 'ar', provider: { providerType: 'DRIVER', displayName: 'مقدم اختبار', bio: 'اختبار' } };
    const r = await t.api('POST', '/api/v1/auth/register', { body });
    assert.equal(r.status, 201);
    return r.body.accessToken;
}
async function uploadFile(token, name) {
    const r = await t.api('POST', '/api/v1/files', { token, body: { purpose: 'provider_document', name, dataBase64: jpeg1x1 } });
    assert.equal(r.status, 201);
    return r.body.file.id;
}
describe('Provider document lifecycle', () => {
    test('الهوية والترخيص لكل منهما وثيقة حالية واحدة فقط', async () => {
        const token = await registerProvider();
        const id1 = await uploadFile(token, 'id-1.jpg');
        const id2 = await uploadFile(token, 'id-2.jpg');
        const a = await t.api('POST', '/api/v1/provider/documents', { token, body: { docType: 'ID', fileId: id1 } });
        assert.equal(a.status, 201);
        const b = await t.api('POST', '/api/v1/provider/documents', { token, body: { docType: 'ID', fileId: id2 } });
        assert.equal(b.status, 200);
        const docs = b.body.documents.filter((d) => d.docType === 'ID');
        assert.equal(docs.length, 1);
        assert.equal(docs[0].fileName, 'id-2.jpg');
        assert.equal(t.app.db.one('SELECT COUNT(*) c FROM provider_documents WHERE doc_type=\'ID\'').c, 1);
        assert.equal(t.app.db.get('SELECT 1 FROM files WHERE id = ?', id1), undefined);
    });
    test('عرض وثيقة خاصة يتطلب جلسة ويعمل مع جلسة مقدم الخدمة', async () => {
        const token = await registerProvider();
        const id = await uploadFile(token, 'view-test.jpg');
        assert.equal((await t.api('POST', '/api/v1/provider/documents', { token, body: { docType: 'ID', fileId: id } })).status, 201);
        assert.equal((await t.api('GET', `/api/v1/files/${id}`)).status, 401);
        const viewed = await t.api('GET', `/api/v1/files/${id}`, { token });
        assert.equal(viewed.status, 200);
        assert.equal(viewed.headers.get('content-type'), 'image/jpeg');
    });
    test('الإدارة لا تستطيع توثيق مقدم بدون الهوية والترخيص', async () => {
        const token = await registerProvider();
        const provider = t.app.db.one('SELECT id FROM service_providers ORDER BY created_at DESC LIMIT 1');
        const admin = await loginAdmin(t.api);
        const r = await t.api('PATCH', `/api/v1/admin/providers/${provider.id}/verification`, { token: admin, body: { status: 'VERIFIED' } });
        assert.equal(r.status, 422);
        assert.equal(r.body.error.code, 'DOCUMENTS_REQUIRED');
        void token;
    });
    test('التوثيق يوافق الوثيقتين والرفض يعيدهما إلى مرفوض مع السبب', async () => {
        const token = await registerProvider();
        const id = await uploadFile(token, 'identity.jpg');
        const lic = await uploadFile(token, 'license.jpg');
        assert.equal((await t.api('POST', '/api/v1/provider/documents', { token, body: { docType: 'ID', fileId: id } })).status, 201);
        assert.equal((await t.api('POST', '/api/v1/provider/documents', { token, body: { docType: 'LICENSE', fileId: lic } })).status, 201);
        const provider = t.app.db.one('SELECT id FROM service_providers ORDER BY created_at DESC LIMIT 1');
        const admin = await loginAdmin(t.api);
        const ok = await t.api('PATCH', `/api/v1/admin/providers/${provider.id}/verification`, { token: admin, body: { status: 'VERIFIED' } });
        assert.equal(ok.status, 200);
        const approved = t.app.db.all('SELECT doc_type,status,reviewed_by FROM provider_documents WHERE provider_id=? ORDER BY doc_type', provider.id);
        assert.deepEqual(approved.map((x) => [x.doc_type, x.status]), [['ID', 'APPROVED'], ['LICENSE', 'APPROVED']]);
        const newId = await uploadFile(token, 'identity-new.jpg');
        const repl = await t.api('POST', '/api/v1/provider/documents', { token, body: { docType: 'ID', fileId: newId } });
        assert.equal(repl.status, 200);
        const rejected = await t.api('PATCH', `/api/v1/admin/providers/${provider.id}/verification`, { token: admin, body: { status: 'REJECTED', reason: 'الهوية غير واضحة' } });
        assert.equal(rejected.status, 200);
        const d = t.app.db.get('SELECT status,note FROM provider_documents WHERE provider_id=? AND doc_type=\'ID\'', provider.id);
        assert.deepEqual([d.status, d.note], ['REJECTED', 'الهوية غير واضحة']);
    });
});
//# sourceMappingURL=provider-documents.test.js.map