import { Injectable, signal } from '@angular/core';

/** Lets a manage screen name the event it loaded, shown by ManageLayout. */
@Injectable({ providedIn: 'root' })
export class ManageContext {
  readonly eventLabel = signal('');
}
