// 검색 우선순위 타입
export type SearchPriority = 'price' | 'date' | 'genre' | 'location' | 'count' | 'popularity';

// 우선순위 가중치 (1순위 40%, 2순위 30%, 3순위 20%, 4순위 10%)
export interface PriorityWeights {
  first: SearchPriority;   // 40%
  second: SearchPriority;  // 30%
  third: SearchPriority;   // 20%
  fourth?: SearchPriority; // 10%
}

// 검색 쿼리 분석 결과
export interface QueryAnalysis {
  priorities: PriorityWeights;
  keywords: {
    isFree: boolean;        // "무료" 키워드
    isTrending: boolean;    // "핫한", "인기" 키워드
    hasDateKeyword: boolean; // "다음주", "이번주" 등
    hasCountKeyword: boolean; // "3개", "10개" 등
  };
  parsedParams: {
    genreCode?: string;
    startDate?: string;
    endDate?: string;
    sidoCode?: string;
    gugunCode?: string;
    minCount?: number;
  };
}

// 공연 점수 정보
export interface EventScore {
  event: any;
  totalScore: number;
  breakdown: {
    priceScore: number;
    dateScore: number;
    genreScore: number;
    locationScore: number;
    popularityScore: number;
  };
}

// 스마트 검색 결과
export interface SmartSearchResult {
  events: any[];
  level: number; // 1~4 (완화 단계)
  relaxedConditions: string[];
  message: string;
  scores?: EventScore[]; // 점수 상세 (디버깅용)
}

// 완화 전략 설정
export interface RelaxationStrategy {
  locationExpansion: 'none' | 'nearby' | 'city' | 'nationwide';
  genreExpansion: 'none' | 'similar' | 'all';
  dateExpansion: 'none' | 'week' | 'month';
  allowPriceIncrease: boolean;
}