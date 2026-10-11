import { TestBed } from '@angular/core/testing';
import { InstallService } from './install.service';

describe('PWA installation lifecycle', () => {
  afterEach(() => TestBed.resetTestingModule());

  function offer(outcome: 'accepted' | 'dismissed' = 'dismissed') {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    const prompt = vi.fn().mockResolvedValue(undefined);
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
    window.dispatchEvent(event);
    return { event, prompt };
  }

  it('waits for a gesture, consumes a prompt once and does not treat acceptance as installation', async () => {
    const service = TestBed.inject(InstallService);
    const { event, prompt } = offer('accepted');
    expect(event.defaultPrevented).toBe(true);
    expect(service.available()).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    await Promise.all([service.install(), service.install()]);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(service.available()).toBe(false);
    expect(service.installed()).toBe(false);
    window.dispatchEvent(new Event('appinstalled'));
    expect(service.installed()).toBe(true);
    offer();
    expect(service.available()).toBe(false);
  });

  it('recovers from browser errors and can accept a fresh offer after dismissal', async () => {
    const service = TestBed.inject(InstallService);
    const { prompt } = offer();
    prompt.mockRejectedValueOnce(new Error('Browser declined'));
    await service.install();
    expect(service.busy()).toBe(false);
    const next = offer();
    await service.install();
    expect(next.prompt).toHaveBeenCalledTimes(1);
    expect(service.installed()).toBe(false);
  });
});
