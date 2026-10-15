/** Web Locks gives one audible tab per event; older browsers use a verified short lease. */
export class AudioLeader {
  private readonly token = crypto.randomUUID();
  private scope = '';
  private generation = 0;
  private requesting = false;
  private timer?: ReturnType<typeof setInterval>;
  private claim?: ReturnType<typeof setTimeout>;
  private release?: () => void;
  constructor(private readonly changed: (leader: boolean) => void) {}
  start(eventId: string) {
    if (this.scope === eventId) return;
    this.stop();
    this.scope = eventId;
    this.attempt();
    this.timer = setInterval(() => this.attempt(), 2000);
  }
  stop() {
    const key = this.key();
    this.scope = '';
    this.generation++;
    this.requesting = false;
    if (this.timer) clearInterval(this.timer);
    if (this.claim) clearTimeout(this.claim);
    this.release?.();
    this.release = undefined;
    this.changed(false);
    try {
      const lease = JSON.parse(localStorage.getItem(key) || 'null');
      if (lease?.owner === this.token) localStorage.removeItem(key);
    } catch {
      /* Storage unavailable. */
    }
  }
  private key() {
    return `bts.audio.leader.${this.scope}`;
  }
  owns(eventId: string) {
    if (!eventId || this.scope !== eventId) return false;
    if (typeof navigator.locks?.request === 'function') return !!this.release;
    try {
      const lease = JSON.parse(localStorage.getItem(this.key()) || 'null');
      return lease?.owner === this.token && Number(lease?.expires) > Date.now();
    } catch {
      return false;
    }
  }
  private attempt() {
    if (!this.scope || this.requesting) return;
    const generation = this.generation;
    if (typeof navigator.locks?.request === 'function') {
      this.requesting = true;
      void navigator.locks
        .request(`bts.audio.${this.scope}`, { ifAvailable: true }, async (lock) => {
          if (!lock || generation !== this.generation) return;
          this.changed(true);
          await new Promise<void>((resolve) => {
            this.release = resolve;
          });
        })
        .catch(() => {
          if (generation === this.generation) this.changed(false);
        })
        .finally(() => {
          if (generation === this.generation) this.requesting = false;
        });
      return;
    }
    const key = this.key();
    try {
      const lease = JSON.parse(localStorage.getItem(key) || 'null');
      if (lease?.owner !== this.token && Number(lease?.expires) > Date.now()) {
        this.changed(false);
        return;
      }
      localStorage.setItem(key, JSON.stringify({ owner: this.token, expires: Date.now() + 6000 }));
      if (this.claim) clearTimeout(this.claim);
      this.claim = setTimeout(() => {
        if (generation !== this.generation) return;
        try {
          this.changed(JSON.parse(localStorage.getItem(key) || 'null')?.owner === this.token);
        } catch {
          this.changed(false);
        }
      }, 100);
    } catch {
      this.changed(false);
    }
  }
}
