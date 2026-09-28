import { describe, it, expect } from 'vitest';
import { ScoreCalculator } from './score-calculator.js';
import { PriorityWeights } from '../types/search.types.js';

const calc = new ScoreCalculator();
const priorities: PriorityWeights = { first: 'date', second: 'location', third: 'genre', fourth: 'count' };

describe('ScoreCalculator.scoreAndSort', () => {
  it('점수 높은 순 정렬', () => {
    const events = [
      { prfnm: 'A', genrenm: '연극', area: '서울 강남구', prfpdfrom: '2026.10.01', prfpdto: '2026.10.10' },
      { prfnm: 'B', genrenm: '뮤지컬', area: '부산', prfpdfrom: '2027.01.01', prfpdto: '2027.02.01' },
    ];
    const out = calc.scoreAndSort(events, priorities, {
      targetDate: { start: '20261001', end: '20261010' },
      targetLocation: '1168',
      targetGenre: 'AAAA', // 연극
    });
    expect(out[0].event.prfnm).toBe('A'); // 날짜/지역/장르 모두 A가 우세
    expect(out).toHaveLength(2);
  });

  it('무료 공연은 price 점수 만점', () => {
    const events = [{ prfnm: 'Free', pcseguidance: '전석 무료', genrenm: '연극' }];
    const out = calc.scoreAndSort(events, { first: 'price', second: 'date', third: 'genre', fourth: 'location' }, { isFree: true });
    expect(out[0].breakdown.priceScore).toBe(100);
  });
});
