import { DestroyRef, Injectable, inject, signal } from '@angular/core';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class InstallService {
  private pending: InstallPrompt | null = null;
  readonly available = signal(false);
  readonly busy = signal(false);
  readonly installed = signal(
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  );

  constructor() {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      if (this.installed()) return;
      this.pending = event as InstallPrompt;
      this.available.set(true);
    };
    const installed = () => {
      this.installed.set(true);
      this.pending = null;
      this.available.set(false);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    });
  }

  async install() {
    const prompt = this.pending;
    if (!prompt || this.busy()) return;
    this.pending = null;
    this.available.set(false);
    this.busy.set(true);
    try {
      await prompt.prompt();
      // Acceptance is not proof of installation; appinstalled confirms it.
      await prompt.userChoice;
    } catch {
      // Manual installation guidance remains available after a browser failure.
    } finally {
      this.busy.set(false);
    }
  }
}
