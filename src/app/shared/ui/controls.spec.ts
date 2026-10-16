import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DsInput } from './controls';

describe('password visibility', () => {
  it('remasks programmatic values and form resets without reporting a user edit', () => {
    const field = TestBed.runInInjectionContext(() => new DsInput());
    let edits = 0;
    field.registerOnChange(() => edits++);
    field.passwordVisible.set(true);
    field.writeValue('synthetic-test-value');
    expect(field.passwordVisible()).toBe(false);
    expect(field.value()).toBe('synthetic-test-value');
    field.passwordVisible.set(true);
    field.writeValue('');
    expect(field.passwordVisible()).toBe(false);
    expect(field.value()).toBe('');
    expect(edits).toBe(0);
  });
});
