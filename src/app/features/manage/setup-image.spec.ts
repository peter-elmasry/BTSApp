import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { ReadCacheService } from '../../core/offline/read-cache.service';
import { EventSetupPage } from './setup-page';
import { DirectionService } from '../../core/i18n/i18n.service';

describe('pending game photo selection', () => {
  let page: EventSetupPage;
  let resolve: () => void;
  const photo = new File(['webp'], 'photo.webp', { type: 'image/webp' });
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: DirectionService, useValue: { language: () => 'en' } },
        { provide: AuthStore, useValue: {} },
        { provide: OpQueueService, useValue: {} },
        {
          provide: ReadCacheService,
          useValue: {
            read: vi.fn().mockResolvedValue({ event: {}, teams: [], games: [], rounds: [] }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ eventId: 'event' }) } },
        },
      ],
    });
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockReturnValue(
        new Promise((done) => {
          resolve = () => done({ width: 100, height: 50, close: vi.fn() });
        }),
      ),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(new Blob(['webp'], { type: 'image/webp' })),
    );
    page = TestBed.runInInjectionContext(() => new EventSetupPage());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const selection = () => ({ target: { files: [photo], value: 'photo.webp' } }) as unknown as Event;
  it('discards conversion when switching to another game', async () => {
    const pending = page.selectGameImage(selection());
    expect(page.imageProcessing()).toBe(true);
    page.editGame({ id: 'other', code: 'G02', name_en: 'Other' });
    resolve();
    await pending;
    expect(page.gameImage()).toBeNull();
    expect(page.imageProcessing()).toBe(false);
  });
  it('does not save while conversion is pending and discards results after destruction', async () => {
    const pending = page.selectGameImage(selection());
    page.gameForm.controls.code.setValue('G01');
    page.gameForm.controls.name_en.setValue('Game');
    await expect(page.saveGame()).resolves.toBeUndefined();
    TestBed.resetTestingModule();
    resolve();
    await pending;
    expect(page.gameImage()).toBeNull();
  });
});
