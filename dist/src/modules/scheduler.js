export function createScheduler(app) {
    let timer = null;
    const runOnce = () => {
        try {
            const r = app.assignment.tick();
            if (r.expired || r.waved || r.exhausted)
                app.log.debug('scheduler_tick', r);
        }
        catch (e) {
            app.log.error('scheduler_tick_failed', { err: String(e) });
        }
        try {
            const now = new Date(app.clock.now()).toISOString();
            app.db.run(`UPDATE quotes SET status='EXPIRED', updated_at=? WHERE status='SUBMITTED' AND valid_until IS NOT NULL AND valid_until <= ?`, now, now);
            const timeout = app.settings.get('presence.timeout_sec');
            const cutoff = new Date(app.clock.now() - timeout * 1000).toISOString();
            const stale = app.db.all(`SELECT id,user_id FROM service_providers WHERE is_online=1 AND (last_seen_at IS NULL OR last_seen_at < ?)`, cutoff);
            for (const p of stale) {
                app.db.run(`UPDATE service_providers SET is_online=0,updated_at=? WHERE id=?`, now, p.id);
                app.db.run(`UPDATE provider_presence_sessions SET ended_at=? WHERE provider_id=? AND ended_at IS NULL`, now, p.id);
                app.sse.send(p.user_id, 'sync', { scope: 'provider' });
            }
        }
        catch (e) {
            app.log.error('scheduler_quote_expiry_failed', { err: String(e) });
        }
    };
    return {
        start() { if (!timer) {
            timer = setInterval(runOnce, app.config.assignmentTickMs);
            timer.unref?.();
        } },
        stop() { if (timer) {
            clearInterval(timer);
            timer = null;
        } },
        runOnce,
    };
}
//# sourceMappingURL=scheduler.js.map