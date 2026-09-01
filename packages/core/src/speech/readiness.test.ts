import { describe, expect, it } from 'vitest';
import { describeRtf, measuredReadiness, staticReadiness } from './readiness.js';

const GB = 1_000_000_000;
const GIB = 1_073_741_824;
const machine = (totalGb: number, freeGb = 100) => ({
  totalMemBytes: totalGb * GIB,
  platform: 'darwin',
  arch: 'arm64',
  freeDiskBytes: freeGb * GB,
});

describe('the static stage', () => {
  it('recommends the largest size the memory floors allow', () => {
    expect(staticReadiness(machine(24))).toEqual({ word: 'untested', recommended: 'turbo', figure: '24 GB · Apple Silicon' });
    expect(staticReadiness(machine(6)).recommended).toBe('small');
    expect(staticReadiness(machine(3)).recommended).toBe('base');
  });

  it('is unfit below the smallest floor, and names the figure that failed', () => {
    const word = staticReadiness(machine(1.5));
    expect(word.word).toBe('unfit');
    expect(word.figure).toBe('1.5 GB RAM');
    expect(word.recommended).toBeUndefined();
  });

  it('is unfit without twice the download free on disk', () => {
    const word = staticReadiness(machine(24, 0.8));
    expect(word.word).toBe('unfit');
    expect(word.figure).toBe('0.8 GB free');
    expect(word.reason).toContain('1.1 GB of free disk');
  });

  it('describes the machine in the figure', () => {
    expect(staticReadiness({ ...machine(16), platform: 'linux', arch: 'x64' }).figure).toBe('16 GB · Linux x64');
  });
});

describe('the measured stage', () => {
  it('is fit at or under the threshold and slow above it', () => {
    expect(measuredReadiness(0.1)).toBe('fit');
    expect(measuredReadiness(0.3)).toBe('fit');
    expect(measuredReadiness(0.4)).toBe('slow');
    expect(describeRtf(0.4)).toBe('0.4× real time');
    expect(describeRtf(0.05)).toBe('0.05× real time');
  });
});
