import { describe, it, expect } from 'vitest';
import { SmartSearchService } from './smart-search.service.js';

// 최소한의 가짜 KopisService: Level 1에서 넉넉히 반환하도록
function fakeKopis(count: number) {
  const events = Array.from({ length: count }, (_, i) => ({
    mt20id: `PF${i}`, prfnm: `공연${i}`, genrenm: '뮤지컬', area: '서울', pcseguidance: '무료',
    prfpdfrom: '2026.10.01', prfpdto: '2026.10.31',
  }));
  return {
    searchEventsByLocation: async () => ({ events, searchLevel: 'gugun', message: '' }),
    filterFreeEvents: async () => ({ events, freeCount: count, paidCount: 0, message: '', dateRange: '' }),
    getTrendingPerformances: async () => ({ performances: events, count, message: '', scoreInfo: '' }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('SmartSearchService — B1 회귀: limit 반영', () => {
  it('trending에서 limit 20이면 20개 반환 (기존엔 3개만 나왔음)', async () => {
    const svc = new SmartSearchService(fakeKopis(30));
    const r = await svc.search('get_trending_performances', { limit: 20 });
    expect(r.events.length).toBe(20);
    expect(r.level).toBe(1);
  });

  it('limit 미지정 시 trending 기본 20개', async () => {
    const svc = new SmartSearchService(fakeKopis(30));
    const r = await svc.search('get_trending_performances', {});
    expect(r.events.length).toBe(20);
  });

  it('결과가 minCount(3) 미만이면 완화 시도 후 level 상승 또는 0', async () => {
    const svc = new SmartSearchService(fakeKopis(0));
    const r = await svc.search('search_events_by_location', { genreCode: 'AAAA', startDate: '20261001', endDate: '20261007' });
    expect(r.events.length).toBe(0);
    expect(r.level).toBe(0); // 전부 실패
  });
});
