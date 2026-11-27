/**
 * Reactive browser connectivity monitor (`navigator.onLine` + `online`/`offline` events)
 * so Offline PWA play works seamlessly while Online 1vs1 locks automatically when internet is unavailable!
 */
type NetworkStatusListener = (online: boolean) => void;

class NetworkStatusManager {
  private readonly listeners = new Set<NetworkStatusListener>();
  private overrideOnline: boolean | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const notify = () => this.emit();
      window.addEventListener('online', notify);
      window.addEventListener('offline', notify);
    }
  }

  isOnline(): boolean {
    if (this.overrideOnline !== null) {
      return this.overrideOnline;
    }
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine !== false;
  }

  setTestOverride(online: boolean | null): void {
    this.overrideOnline = online;
    this.emit();
  }

  subscribe(fn: NetworkStatusListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    const state = this.isOnline();
    for (const fn of this.listeners) {
      fn(state);
    }
  }
}

export const networkStatus = new NetworkStatusManager();
