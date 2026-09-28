// KOPIS 공연 객체 관련 순수 헬퍼 (외부 의존성 없음, 테스트하기 쉬움)

/**
 * 무료 공연 여부. pcseguidance(관람료 안내 문자열) 기준.
 */
export function isFreeEvent(event: { pcseguidance?: string }): boolean {
  const price = event.pcseguidance;
  if (!price) return false;
  return (
    price.toLowerCase().includes('무료') ||
    price === '0' ||
    price === '0원'
  );
}

/**
 * 관람료 문자열에서 최저가(원) 추출. 없으면 Infinity.
 * 예: "R석 60,000원, S석 40,000원" → 40000 (쉼표 제거 후 파싱)
 */
export function extractMinPrice(priceStr?: string): number {
  if (!priceStr) return Infinity;
  const cleaned = priceStr.replace(/,/g, '');
  const matches = cleaned.match(/\d+/g);
  if (!matches) return Infinity;
  return Math.min(...matches.map(Number));
}
