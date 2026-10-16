/** SseHub: قناة الوقت الحقيقي (خادم ← عميل). Port قابل للاستبدال بـWebSocket/Push لاحقًا. */
export class SseHub {
    maxPerUser;
    clients = new Map();
    publicClients = new Set();
    timer;
    constructor(maxPerUser = 5) {
        this.maxPerUser = maxPerUser;
        this.timer = setInterval(() => this.ping(), 25_000);
        this.timer.unref?.();
    }
    add(userId, res) {
        const set = this.clients.get(userId) || new Set();
        if (set.size >= this.maxPerUser) {
            const oldest = set.values().next().value;
            if (oldest) {
                oldest.end();
                set.delete(oldest);
            }
        }
        set.add(res);
        this.clients.set(userId, set);
        res.on('close', () => { set.delete(res); if (!set.size)
            this.clients.delete(userId); });
    }
    /** Anonymous subscribers receive only whitelisted public catalog/configuration events. */
    addPublic(res) {
        this.publicClients.add(res);
        res.on('close', () => this.publicClients.delete(res));
    }
    broadcastPublic(event, data) {
        if (event !== 'sync' || !data || typeof data !== 'object')
            return;
        const scope = String(data.scope || '');
        if (!['catalog', 'settings', 'campaigns', 'temporary-services', 'order-stores'].includes(scope))
            return;
        for (const res of this.publicClients) {
            try {
                res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            }
            catch { /* connection closed */ }
        }
    }
    send(userId, event, data) {
        for (const res of this.clients.get(userId) || []) {
            try {
                res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            }
            catch { /* connection closed */ }
        }
    }
    broadcast(event, data) { for (const set of this.clients.values())
        for (const res of set)
            try {
                res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            }
            catch { /* connection closed */ } this.broadcastPublic(event, data); }
    ping() { for (const set of this.clients.values())
        for (const res of set)
            try {
                res.write(': ping\n\n');
            }
            catch { /* ignore */ } for (const res of this.publicClients)
        try {
            res.write(': ping\n\n');
        }
        catch { /* ignore */ } }
    stats() { let connections = this.publicClients.size; for (const set of this.clients.values())
        connections += set.size; return { users: this.clients.size + (this.publicClients.size ? 1 : 0), connections }; }
    closeAll() { clearInterval(this.timer); for (const set of this.clients.values())
        for (const r of set)
            r.end(); for (const r of this.publicClients)
        r.end(); this.clients.clear(); this.publicClients.clear(); }
}
//# sourceMappingURL=sse.js.map