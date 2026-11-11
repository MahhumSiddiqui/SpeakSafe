import { describe, it, expect } from 'vitest';
import { canonicalJson } from '../src/lib/canonical.js';

describe('canonicalJson', () => {
  it('produces the same string regardless of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it('handles null and arrays', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson([3, { y: 1, x: 2 }])).toBe('[3,{"x":2,"y":1}]');
  });
});
