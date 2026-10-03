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