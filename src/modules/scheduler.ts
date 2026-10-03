import type { App } from '../app.js';

/**
 * Scheduler: يشغّل دوريًا انتهاء مهل عروض الإسناد وتقدّم الموجات (Assignment.tick) وانتهاء عروض الأسعار.
 * التنفيذ الحالي: مؤقّت داخلي (setInterval) — بلا اعتماديات خارجية. هذا هو موضع استبدال BullMQ+Redis
 * لاحقًا (Job متكرر بنفس الاستدعاء `app.assignment.tick()`) دون تغيير منطق العمل نفسه.
 */
export interface Scheduler { start(): void; stop(): void; runOnce(): void }

export function createScheduler(app: App): Scheduler {
  let timer: ReturnType<typeof setInterval> | null = null;
  const runOnce = (): void => {
    try {
      const r = app.assignment.tick();
      if (r.expired || r.waved || r.exhausted) app.log.debug('scheduler_tick', r);
    } catch (e) {
      app.log.error('scheduler_tick_failed', { err: String(e) });
    }
    try {
      const now = new Date(app.clock.now()).toISOString();
      app.db.run(`UPDATE quotes SET status='EXPIRED', updated_at=? WHERE status='SUBMITTED' AND valid_until IS NOT NULL AND valid_until <= ?`, now, now);
    } catch (e) {
      app.log.error('scheduler_quote_expiry_failed', { err: String(e) });
    }
  };
  return {
    start(): void { if (!timer) { timer = setInterval(runOnce, app.config.assignmentTickMs); timer.unref?.(); } },
    stop(): void { if (timer) { clearInterval(timer); timer = null; } },
    runOnce,
  };
}
