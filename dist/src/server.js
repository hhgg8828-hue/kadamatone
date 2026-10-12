import { createApp } from './app.js';
import { seedBase } from './db/seed.js';
import fs from 'node:fs';
import path from 'node:path';
const app = createApp();
// Fail fast on deployment if required PWA shells were not copied into the runtime image.
for (const asset of ['index.html', 'customer.html', 'provider.html', 'admin.html', 'js/app.js', 'sw.js']) {
    const fullPath = path.join(app.config.publicDir, asset);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        throw new Error(`Required public asset missing from build: ${asset} (${fullPath})`);
    }
}
app.log.info('static_shell_assets_verified', { publicDir: app.config.publicDir, shells: ['/', '/customer', '/provider', '/admin'] });
// Railway/production must initialize the catalog and first admin automatically.
// seedBase is idempotent: it adds missing defaults without overwriting admin edits.
const seedResult = await seedBase(app.db, app.config);
app.log.info('startup_seed_complete', {
    categoriesAdded: seedResult.categories,
    servicesAdded: seedResult.services,
    adminCreated: seedResult.adminCreated,
});
if (seedResult.adminCreated) {
    app.log.info('startup_admin_created', { email: app.config.admin.email });
}
app.server.listen(app.config.port, () => app.log.info('server_started', { port: app.config.port, env: app.config.env }));
let stopping = false;
async function shutdown(sig) {
    if (stopping)
        return;
    stopping = true;
    app.log.info('shutdown', { sig });
    await app.close();
    process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => app.log.error('unhandledRejection', { err: String(e) }));
//# sourceMappingURL=server.js.map