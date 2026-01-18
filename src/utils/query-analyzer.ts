import { QueryAnalysis, PriorityWeights } from '../types/search.types.js';

/**
 * 사용자 쿼리를 분석하여 우선순위를 결정하는 분석기
 */
export class QueryAnalyzer {
  
  /**
   * 도구 이름과 파라미터를 기반으로 검색 전략 분석
   */
  analyze(toolName: string, args: any): QueryAnalysis {
    const keywords = this.extractKeywords(toolName, args);
    const priorities = this.determinePriorities(toolName, keywords);
    const parsedParams = this.parseParameters(args);

    return {
      priorities,
      keywords,
      parsedParams,
    };
  }

  /**
   * 키워드 추출
   */
  private extractKeywords(toolName: string, args: any) {
    return {
      isFree: toolName === 'filter_free_events',
      isTrending: toolName === 'get_trending_performances',
      hasDateKeyword: this.hasSpecificDateRange(args),
      hasCountKeyword: args?.limit !== undefined,
    };
  }

  /**
   * 특정 날짜 범위 키워드 감지
   */
  private hasSpecificDateRange(args: any): boolean {
    if (!args?.startDate || !args?.endDate) return false;
    
    const start = new Date(
      parseInt(args.startDate.substring(0, 4)),
      parseInt(args.startDate.substring(4, 6)) - 1,
      parseInt(args.startDate.substring(6, 8))
    );
    const end = new Date(
      parseInt(args.endDate.substring(0, 4)),
      parseInt(args.endDate.substring(4, 6)) - 1,
      parseInt(args.endDate.substring(6, 8))
    );
    
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    // 7일 이하면 "다음주" 같은 특정 기간
    return diff <= 7;
  }

  /**
   * 우선순위 결정 로직
   */
  private determinePriorities(toolName: string, keywords: any): PriorityWeights {
    // Case 1: 무료 공연 검색
    if (keywords.isFree) {
      return {
        first: 'price',      // 40% - 가격이 최우선
        second: 'date',      // 30% - 날짜 (이미 오늘~30일 고정)
        third: 'genre',      // 20% - 장르
        fourth: 'location',  // 10% - 위치
      };
    }

    // Case 2: 인기/핫한 공연 검색
    if (keywords.isTrending) {
      return {
        first: 'popularity', // 40% - 인기도 최우선
        second: 'count',     // 30% - 개수 달성
        third: 'genre',      // 20% - 장르
        fourth: 'date',      // 10% - 날짜
      };
    }

    // Case 3: 특정 날짜 범위 검색 (다음주 등)
    if (keywords.hasDateKeyword) {
      return {
        first: 'date',       // 40% - 날짜 최우선
        second: 'count',     // 30% - 개수 달성
        third: 'genre',      // 20% - 장르
        fourth: 'location',  // 10% - 위치
      };
    }

    // Case 4: 기본 검색
    return {
      first: 'date',       // 40% - 날짜 (디폴트: 오늘~한달)
      second: 'location',  // 30% - 위치
      third: 'genre',      // 20% - 장르
      fourth: 'count',     // 10% - 개수
    };
  }

  /**
   * 파라미터 파싱
   */
  private parseParameters(args: any) {
    return {
      genreCode: args?.genreCode,
      startDate: args?.startDate,
      endDate: args?.endDate,
      sidoCode: args?.sidoCode,
      gugunCode: args?.gugunCode,
      minCount: args?.limit || 3, // 기본 3개
    };
  }
}