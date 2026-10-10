import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { appConfig } from './app.config';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { PublicApi } from './core/player/public-api';

class TestLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      app: { title: 'DST' },
      common: { switchLanguage: 'Switch language', navigation: 'Navigation', skip: 'Skip' },
      nav: { home: 'Home', schedule: 'Schedule', about: 'About' },
    });
  }
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        ...appConfig.providers,
        {
          provide: PublicApi,
          useValue: {
            currentEvent: async () => null,
            serverNow: async () => new Date().toISOString(),
          },
        },
        provideTransloco({
          config: {
            availableLangs: ['ar', 'en'],
            defaultLang: 'ar',
            reRenderOnLangChange: true,
            prodMode: true,
          },
          loader: TestLoader,
        }),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders branded header and navigation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('header img')?.getAttribute('src')).toBe(
      '/brand/dst-mark-white.webp',
    );
    expect(compiled.querySelectorAll('nav a').length).toBe(3);
  });
});
