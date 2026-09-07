import { describe, expect, it } from 'vitest';
import { DEFAULT_MACHINE_LIMITS, machineLimits, sameMachineLimits } from './resources.js';

describe('Machine execution limits', () => {
  it('supplies defaults without requiring a creation-time choice', () => {
    expect(machineLimits(DEFAULT_MACHINE_LIMITS)).toEqual({ maxCpus: 2, maxMemoryBytes: 4294967296 });
  });
  it.each([0, -1, 1.5, NaN, Infinity, 1025])('rejects invalid CPU ceiling %s', (maxCpus) => {
    expect(() => machineLimits({ ...DEFAULT_MACHINE_LIMITS, maxCpus })).toThrow();
  });
  it.each([0, -1, 1024, NaN, Infinity, 67108865])('rejects invalid RAM ceiling %s', (maxMemoryBytes) => {
    expect(() => machineLimits({ ...DEFAULT_MACHINE_LIMITS, maxMemoryBytes })).toThrow();
  });
  it('copies validated input and compares both ceilings', () => {
    const input = { maxCpus: 1, maxMemoryBytes: 1073741824 };
    const fixed = machineLimits(input);
    input.maxCpus = 5;
    expect(fixed.maxCpus).toBe(1);
    expect(sameMachineLimits(fixed, input)).toBe(false);
    expect(sameMachineLimits(fixed, { ...fixed, maxMemoryBytes: 2147483648 })).toBe(false);
    expect(sameMachineLimits(fixed, { ...fixed })).toBe(true);
  });
});
