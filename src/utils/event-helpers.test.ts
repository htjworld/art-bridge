import { describe, it, expect } from 'vitest';
import { isFreeEvent, extractMinPrice } from './event-helpers.js';

describe('isFreeEvent', () => {
  it('무료 텍스트 감지', () => {
    expect(isFreeEvent({ pcseguidance: '전석 무료' })).toBe(true);
    expect(isFreeEvent({ pcseguidance: '0' })).toBe(true);
    expect(isFreeEvent({ pcseguidance: '0원' })).toBe(true);
  });
  it('유료/미상은 false', () => {
    expect(isFreeEvent({ pcseguidance: 'R석 50,000원' })).toBe(false);
    expect(isFreeEvent({})).toBe(false);
    expect(isFreeEvent({ pcseguidance: undefined })).toBe(false);
  });
});

describe('extractMinPrice', () => {
  it('쉼표 포함 최저가 파싱 (기존 버그 회귀 방지)', () => {
    expect(extractMinPrice('R석 60,000원, S석 40,000원')).toBe(40000);
  });
  it('가격 없음 → Infinity', () => {
    expect(extractMinPrice('')).toBe(Infinity);
    expect(extractMinPrice(undefined)).toBe(Infinity);
    expect(extractMinPrice('전석 무료')).toBe(Infinity);
  });
});
