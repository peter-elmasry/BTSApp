import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast';

describe('toast acknowledgments', () => {
  let toast: ToastService;
  let dialog: HTMLDialogElement;
  beforeEach(() => {
    vi.useFakeTimers();
    toast = TestBed.inject(ToastService);
    dialog = TestBed.inject(DOCUMENT).createElement('dialog');
    TestBed.inject(DOCUMENT).body.append(dialog);
  });
  afterEach(() => {
    toast.dismiss();
    dialog.remove();
    vi.useRealTimers();
  });
  it('targets an open modal and keeps the acknowledgment when it closes', () => {
    dialog.setAttribute('open', '');
    toast.show('manage.saved');
    expect(toast.target()).toBe(dialog);
    dialog.removeAttribute('open');
    toast.retarget();
    expect(toast.target()).toBeNull();
    expect(toast.message()).toBe('manage.saved');
    vi.advanceTimersByTime(5000);
    expect(toast.message()).toBe('');
  });
  it('gives repeated saves a new five-second window and supports dismissal', () => {
    toast.show('manage.saved');
    vi.advanceTimersByTime(4000);
    toast.show('manage.saved');
    vi.advanceTimersByTime(4000);
    expect(toast.message()).toBe('manage.saved');
    toast.dismiss();
    expect(toast.message()).toBe('');
    vi.advanceTimersByTime(5000);
    expect(toast.message()).toBe('');
  });
});
