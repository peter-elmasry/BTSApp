import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Translation, TranslocoLoader, TranslocoService } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
export class TranslationLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string) {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

@Injectable({ providedIn: 'root' })
export class DirectionService {
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  readonly language = signal<'ar' | 'en'>('ar');
  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('bts.lang');
    } catch {
      /* Restricted storage: default Arabic. */
    }
    this.setLanguage(saved === 'en' ? 'en' : 'ar');
  }
  setLanguage(lang: 'ar' | 'en') {
    this.language.set(lang);
    this.transloco.setActiveLang(lang);
    this.document.documentElement.lang = lang;
    this.document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem('bts.lang', lang);
    } catch {
      /* Switching still works without persistence. */
    }
  }
  toggle() {
    this.setLanguage(this.language() === 'ar' ? 'en' : 'ar');
  }
}
