import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
export function openDb(file) {
    if (file !== ':memory:')
        fs.mkdirSync(path.dirname(file), { recursive: true });
    const raw = new DatabaseSync(file);
    raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
    const cache = new Map();
    const stmt = (sql) => {
        let s = cache.get(sql);
        if (!s) {
            s = raw.prepare(sql);
            cache.set(sql, s);
        }
        return s;
    };
    let depth = 0;
    let after = [];
    const db = {
        raw,
        exec: (sql) => raw.exec(sql),
        get: (sql, ...p) => stmt(sql).get(...p),
        one: (sql, ...p) => {
            const row = stmt(sql).get(...p);
            if (!row)
                throw new Error(`db.one(): no row for query: ${sql}`);
            return row;
        },
        all: (sql, ...p) => stmt(sql).all(...p),
        run: (sql, ...p) => stmt(sql).run(...p),
        /** معاملة ذرّية. المتداخلة تُدمج في الخارجية. */
        tx(fn) {
            if (depth > 0)
                return fn();
            raw.exec('BEGIN IMMEDIATE');
            depth = 1;
            try {
                const out = fn();
                raw.exec('COMMIT');
                depth = 0;
                const cbs = after;
                after = [];
                for (const cb of cbs) {
                    try {
                        cb();
                    }
                    catch (e) {
                        console.error('afterCommit error', e);
                    }
                }
                return out;
            }
            catch (e) {
                try {
                    raw.exec('ROLLBACK');
                }
                catch { /* already rolled back */ }
                depth = 0;
                after = [];
                throw e;
            }
        },
        /** ينفَّذ بعد نجاح الـCOMMIT فقط (إشعارات لحظية…) أو فورًا خارج معاملة. */
        afterCommit(fn) { if (depth > 0)
            after.push(fn);
        else
            fn(); },
        close() { raw.close(); },
    };
    return db;
}
//# sourceMappingURL=database.js.map