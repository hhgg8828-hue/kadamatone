export interface SseRes { write(chunk: string): boolean; end(chunk?: string): void; on(event: string, cb: (...a: any[]) => void): void }

/** SseHub: قناة الوقت الحقيقي (خادم ← عميل). Port قابل للاستبدال بـWebSocket/Push لاحقًا. */
export class SseHub {
  private maxPerUser: number;
  private clients = new Map<string, Set<SseRes>>();
  private publicClients = new Set<SseRes>();
  private timer: ReturnType<typeof setInterval>;
  constructor(maxPerUser = 5) {
    this.maxPerUser = maxPerUser;
    this.timer = setInterval(() => this.ping(), 25_000);
    this.timer.unref?.();
  }
  add(userId: string, res: SseRes): void {
    const set = this.clients.get(userId) || new Set<SseRes>();
    if (set.size >= this.maxPerUser) { const oldest = set.values().next().value; if (oldest) { oldest.end(); set.delete(oldest); } }
    set.add(res);
    this.clients.set(userId, set);
    res.on('close', () => { set.delete(res); if (!set.size) this.clients.delete(userId); });
  }
  /** Anonymous subscribers receive only whitelisted public catalog/configuration events. */
  addPublic(res: SseRes): void {
    this.publicClients.add(res);
    res.on('close', () => this.publicClients.delete(res));
  }
  private broadcastPublic(event: string, data: unknown): void {
    if (event !== 'sync' || !data || typeof data !== 'object') return;
    const scope = String((data as {scope?: unknown}).scope || '');
    if (!['catalog', 'settings', 'campaigns', 'temporary-services', 'order-stores'].includes(scope)) return;
    for (const res of this.publicClients) {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* connection closed */ }
    }
  }
  send(userId: string, event: string, data: unknown): void {
    for (const res of this.clients.get(userId) || []) {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* connection closed */ }
    }
  }
  broadcast(event: string, data: unknown): void { for (const set of this.clients.values()) for (const res of set) try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* connection closed */ } this.broadcastPublic(event, data); }
  ping(): void { for (const set of this.clients.values()) for (const res of set) try { res.write(': ping\n\n'); } catch { /* ignore */ } for (const res of this.publicClients) try { res.write(': ping\n\n'); } catch { /* ignore */ } }
  stats(): { users:number; connections:number } { let connections=this.publicClients.size; for(const set of this.clients.values()) connections+=set.size; return {users:this.clients.size+(this.publicClients.size?1:0),connections}; }
  closeAll(): void { clearInterval(this.timer); for (const set of this.clients.values()) for (const r of set) r.end(); for (const r of this.publicClients) r.end(); this.clients.clear(); this.publicClients.clear(); }
}
