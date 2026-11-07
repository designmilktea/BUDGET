// Durable, account-scoped pending writes. A revision check prevents stale devices
// from silently overwriting newer data in Firestore.
export class SyncSession {
  constructor({storage, uid, remote, onStatus, onRemote}) {
    Object.assign(this, {storage, uid, remote, onStatus, onRemote});
    this.key = `daily-budget-cloud-pending:${uid}`;
    this.revision = 0; this.pending = null; this.running = false;
    this.hydrated = false; this.closed = false; this.conflict = false; this.timer = null;
  }
  async start(fallback) {
    const raw = this.storage.getItem(this.key);
    const pending = raw ? JSON.parse(raw) : null;
    const cloud = await this.remote.read();
    if (this.closed) return null;
    this.revision = cloud.revision;
    this.hydrated = true;
    if (pending) {
      this.pending = pending.snapshot;
      this.revision = pending.baseRevision === null && cloud.revision === 0 ? 0 : pending.baseRevision;
      if (this.revision !== cloud.revision) this.conflict = true;
      this.onStatus(this.conflict ? 'conflict' : 'pending');
      return pending.snapshot;
    }
    if(cloud.snapshot)this.lastEncoded=JSON.stringify(cloud.snapshot);
    this.onStatus(cloud.snapshot ? 'saved' : 'pending');
    return cloud.snapshot || fallback;
  }
  queue(snapshot) {
    if (this.closed) return;
    const encoded = JSON.stringify(snapshot);
    if (encoded === this.lastEncoded) return;
    this.lastEncoded = encoded;
    this.pending = JSON.parse(encoded);
    this.persist();
    this.onStatus(this.conflict ? 'conflict' : 'pending');
    clearTimeout(this.timer);
    if (this.hydrated && !this.conflict) this.timer = setTimeout(() => this.flush(), 500);
  }
  persist() {
    try { this.storage.setItem(this.key, JSON.stringify({baseRevision:this.revision, snapshot:this.pending})); }
    catch { this.onStatus('storage-error'); }
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.closed || !this.hydrated || this.running || !this.pending || this.conflict) return;
    this.running = true;
    const outgoing = this.pending;
    this.onStatus('saving');
    try {
      const revision = await this.remote.commit(this.revision, outgoing);
      this.revision = revision;
      this.storage.setItem(`daily-budget-cloud-revision:${this.uid}`,String(revision));
      if (this.pending === outgoing) {
        this.pending = null;
        this.storage.removeItem(this.key);
        if (!this.closed) this.onStatus('saved');
      } else {
        this.persist();
      }
    } catch (error) {
      if (error.code === 'budget/conflict') this.conflict = true;
      if (!this.closed) this.onStatus(this.conflict ? 'conflict' : 'error', error);
    } finally {
      this.running = false;
      if (!this.closed && this.pending && !this.conflict && this.pending !== outgoing) this.flush();
    }
  }
  async refresh() {
    if (!this.hydrated || this.closed || this.pending || this.running) return;
    try {
      const cloud = await this.remote.read();
      if (this.closed || this.pending || this.running || cloud.revision <= this.revision) return;
      this.revision = cloud.revision;
      this.lastEncoded = JSON.stringify(cloud.snapshot);
      this.onRemote(cloud.snapshot);
      this.onStatus('saved');
    } catch (error) { if (!this.closed) this.onStatus('error', error); }
  }
  close() { this.closed = true; clearTimeout(this.timer); }
}
