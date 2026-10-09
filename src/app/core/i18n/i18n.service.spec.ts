import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { DirectionService } from './i18n.service';
describe('DirectionService', () => {
  let active: string;
  beforeEach(() => {
    localStorage.clear();
    active = '';
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TranslocoService,
          useValue: { setActiveLang: (lang: string) => (active = lang) },
        },
      ],
    });
  });
  it('defaults to Egyptian Arabic and RTL', () => {
    const service = TestBed.inject(DirectionService);
    expect(service.language()).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(active).toBe('ar');
  });
  it('switches and persists language/direction', () => {
    const service = TestBed.inject(DirectionService);
    service.toggle();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(localStorage.getItem('bts.lang')).toBe('en');
  });
  it('restores English choice', () => {
    localStorage.setItem('bts.lang', 'en');
    expect(TestBed.inject(DirectionService).language()).toBe('en');
  });
});
