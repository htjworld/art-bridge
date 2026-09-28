import { KopisService } from './kopis.service.js';
import { QueryAnalyzer } from '../utils/query-analyzer.js';
import { ScoreCalculator } from '../utils/score-calculator.js';
import { SmartSearchResult } from '../types/search.types.js';
import { GENRE_CODES, getGenreName, getSidoNameFull, extractSidoCode } from '../constants/kopis-codes.js';

/**
 * 고정 4단계 완화 전략을 사용하는 스마트 검색 엔진
 */
export class SmartSearchService {
  private queryAnalyzer: QueryAnalyzer;
  private scoreCalculator: ScoreCalculator;

  constructor(private kopisService: KopisService) {
    this.queryAnalyzer = new QueryAnalyzer();
    this.scoreCalculator = new ScoreCalculator();
  }

  /**
   * 스마트 검색 실행 (모든 도구 통합)
   */
  async search(toolName: string, args: any): Promise<SmartSearchResult> {
    const analysis = this.queryAnalyzer.analyze(toolName, args);

    // 완화를 언제 멈출지 판단하는 "최소 결과 수"
    const minCount = analysis.parsedParams.minCount || 3;
    // 실제로 사용자에게 돌려줄 "출력 개수" (툴별 기본값, limit 반영)
    const outputLimit = this.resolveOutputLimit(toolName, args);

    // Level 1: 요청 그대로
    const level1 = await this.executeLevel1(toolName, args);
    if (level1.events.length >= minCount) {
      return this.formatResult(level1.events, 1, [], analysis, outputLimit);
    }

    // Level 2: 우선순위 낮은 조건 1개 완화
    const level2 = await this.executeLevel2(toolName, args, analysis);
    if (level2.events.length >= minCount) {
      return this.formatResult(level2.events, 2, level2.relaxed, analysis, outputLimit);
    }

    // Level 3: 우선순위 낮은 조건 2개 완화
    const level3 = await this.executeLevel3(toolName, args, analysis);
    if (level3.events.length >= minCount) {
      return this.formatResult(level3.events, 3, level3.relaxed, analysis, outputLimit);
    }

    // Level 4: 최대 완화 (고정: 시/도 전체 + 모든 장르 + 한달)
    const level4 = await this.executeLevel4(toolName, args);
    if (level4.events.length >= minCount) {
      return this.formatResult(level4.events, 4, level4.relaxed, analysis, outputLimit);
    }

    // 실패해도 있는 만큼은 반환
    return this.formatResult(level4.events, 0, level4.relaxed, analysis, outputLimit);
  }

  /** 툴별 기본 출력 개수. 사용자가 limit을 주면 그 값(1~50)으로 clamp. */
  private resolveOutputLimit(toolName: string, args: any): number {
    const defaults: Record<string, number> = {
      filter_free_events: 20,
      get_trending_performances: 20,
      search_events_by_location: 10,
    };
    const fallback = defaults[toolName] ?? 10;
    const raw = args?.limit ?? fallback;
    return Math.min(Math.max(raw, 1), 50);
  }

  /**
   * Level 1: 요청 그대로
   */
  private async executeLevel1(toolName: string, args: any) {
    const events = await this.fetchByTool(toolName, args);
    return { events, relaxed: [] as string[] };
  }

  /**
   * Level 2: 우선순위 낮은 조건 1개 완화
   */
  private async executeLevel2(toolName: string, args: any, _analysis: any) {
    const relaxed: string[] = [];

    if (toolName === 'filter_free_events') {
      // 무료 검색: 가격(1) > 날짜(2) > 장르(3) > 위치(4)
      // → 위치 완화 (구/군 → 시/도)
      // ✅ 유틸리티 함수 사용
      const sidoCode = extractSidoCode(args.sidoCode);
      const modifiedArgs = {
        genreCode: args.genreCode,
        sidoCode: sidoCode,
        limit: args.limit || 50,
      };
      const events = await this.fetchByTool(toolName, modifiedArgs);
      relaxed.push(`위치: 구/군 → 시/도 전체`);
      return { events, relaxed };

    } else if (toolName === 'get_trending_performances') {
      // 인기 검색: 인기도(1) > 개수(2) > 장르(3) > 날짜(4)
      // → 장르 완화 (요청 장르 → +유사 장르 1개)
      
      // genreCode가 없으면 이미 전체 장르라서 완화 불필요
      if (!args.genreCode) {
        const events = await this.fetchByTool(toolName, args);
        return { events, relaxed: [] };
      }

      const relatedGenres = this.getRelatedGenres(args.genreCode);
      const allEvents: any[] = [];
      
      for (const genre of relatedGenres.slice(0, 2)) { // 원래 + 1개
        const modifiedArgs = { 
          genreCode: genre,
          limit: args.limit || 50 
        };
        const result = await this.fetchByTool(toolName, modifiedArgs);
        allEvents.push(...result);
      }
      
      const events = this.deduplicateEvents(allEvents);
      // ✅ 유틸리티 함수 사용
      relaxed.push(`장르: ${getGenreName(args.genreCode)} + 유사 장르 1개`);
      return { events, relaxed };

    } else {
      // 위치 검색: 날짜(1) > 위치(2) > 장르(3) > 개수(4)
      // → 장르 완화 (요청 장르 → +유사 장르 1개)
      const relatedGenres = this.getRelatedGenres(args.genreCode);
      const allEvents: any[] = [];
      
      for (const genre of relatedGenres.slice(0, 2)) {
        const modifiedArgs = { 
          ...args, 
          genreCode: genre 
        };
        const events = await this.fetchByTool(toolName, modifiedArgs);
        allEvents.push(...events);
      }
      
      const events = this.deduplicateEvents(allEvents);
      // ✅ 유틸리티 함수 사용
      relaxed.push(`장르: ${getGenreName(args.genreCode)} + 유사 장르 1개`);
      return { events, relaxed };
    }
  }

  /**
   * Level 3: 우선순위 낮은 조건 2개 완화
   */
  private async executeLevel3(toolName: string, args: any, _analysis: any) {
    const relaxed: string[] = [];

    if (toolName === 'filter_free_events') {
      // 무료 검색: 위치(4) + 장르(3) 완화
      // ✅ 유틸리티 함수 사용
      const sidoCode = extractSidoCode(args.sidoCode);
      
      // genreCode가 없으면 장르 완화 불필요
      if (!args.genreCode) {
        const modifiedArgs = {
          genreCode: args.genreCode,
          sidoCode: sidoCode,
          limit: args.limit || 50,
        };
        const events = await this.fetchByTool(toolName, modifiedArgs);
        relaxed.push(`위치: 구/군 → 시/도 전체`);
        return { events, relaxed };
      }

      const relatedGenres = this.getRelatedGenres(args.genreCode);
      const allEvents: any[] = [];

      for (const genre of relatedGenres) {
        const modifiedArgs = {
          genreCode: genre,
          sidoCode: sidoCode,
          limit: args.limit || 20,
        };
        const events = await this.fetchByTool(toolName, modifiedArgs);
        allEvents.push(...events);
      }

      const events = this.deduplicateEvents(allEvents);
      relaxed.push(`위치: 구/군 → 시/도 전체`);
      // ✅ 유틸리티 함수 사용
      relaxed.push(`장르: ${getGenreName(args.genreCode)} + 유사 장르`);
      return { events, relaxed };

    } else if (toolName === 'get_trending_performances') {
      // 인기 검색: 장르(3) + 날짜(4) 완화
      
      // genreCode가 없으면 장르 완화 불필요
      if (!args.genreCode) {
        const events = await this.fetchByTool(toolName, args);
        relaxed.push(`날짜: 최근 30일 범위로 확장`);
        return { events, relaxed };
      }

      const relatedGenres = this.getRelatedGenres(args.genreCode);
      const allEvents: any[] = [];

      for (const genre of relatedGenres) {
        const modifiedArgs = { 
          genreCode: genre,
          limit: args.limit || 20 
        };
        const result = await this.fetchByTool(toolName, modifiedArgs);
        allEvents.push(...result);
      }

      const events = this.deduplicateEvents(allEvents);
      // ✅ 유틸리티 함수 사용
      relaxed.push(`장르: ${getGenreName(args.genreCode)} + 유사 장르`);
      relaxed.push(`날짜: 최근 30일 범위로 확장`);
      return { events, relaxed };

    } else {
      // 위치 검색: 장르(3) + 위치(2) 완화
      // ✅ 유틸리티 함수 사용
      const sidoCode = extractSidoCode(args.gugunCode || args.sidoCode);
      const relatedGenres = this.getRelatedGenres(args.genreCode);
      const allEvents: any[] = [];

      for (const genre of relatedGenres) {
        const modifiedArgs = {
          ...args,
          genreCode: genre,
          sidoCode: sidoCode,
          gugunCode: undefined, // 시/도만 사용
        };
        const events = await this.fetchByTool(toolName, modifiedArgs);
        allEvents.push(...events);
      }

      const events = this.deduplicateEvents(allEvents);
      relaxed.push(`위치: 구/군 → 시/도 전체`);
      // ✅ 유틸리티 함수 사용
      relaxed.push(`장르: ${getGenreName(args.genreCode)} + 유사 장르`);
      return { events, relaxed };
    }
  }

  /**
   * Level 4: 최대 완화 (고정)
   * - 시/도 전체
   * - 모든 장르
   * - 한달 이내 (사용자 요청이 더 길면 그 날짜 유지)
   */
  private async executeLevel4(toolName: string, args: any) {
    const relaxed: string[] = [];
    const today = new Date();

    // 날짜 계산: 한달 이내 (사용자 요청이 더 길면 그 날짜 유지)
    let startDate = this.formatDate(today);
    let endDate: string;

    if (args.endDate) {
      const requestedEnd = new Date(
        parseInt(args.endDate.substring(0, 4)),
        parseInt(args.endDate.substring(4, 6)) - 1,
        parseInt(args.endDate.substring(6, 8))
      );
      const oneMonthLater = new Date(today);
      oneMonthLater.setMonth(today.getMonth() + 1);

      endDate = requestedEnd > oneMonthLater 
        ? args.endDate 
        : this.formatDate(oneMonthLater);
    } else {
      const oneMonthLater = new Date(today);
      oneMonthLater.setMonth(today.getMonth() + 1);
      endDate = this.formatDate(oneMonthLater);
    }

    // ✅ 유틸리티 함수 사용: 시/도 코드 추출
    const sidoCode = extractSidoCode(args.gugunCode || args.sidoCode);

    // 모든 장르 검색
    const allGenres = Object.keys(GENRE_CODES);
    const allEvents: any[] = [];

    for (const genre of allGenres) {
      try {
        // 도구별 분기
        if (toolName === 'filter_free_events') {
          // filterFreeEvents는 자체적으로 오늘~30일 고정이므로
          // startDate/endDate 무시됨
          const result = await this.kopisService.filterFreeEvents({
            genreCode: genre,
            sidoCode: sidoCode,
            limit: 10,
          });
          allEvents.push(...result.events);

        } else if (toolName === 'get_trending_performances') {
          // getTrendingPerformances는 자체적으로 최근 30일 검색
          const result = await this.kopisService.getTrendingPerformances({
            genreCode: genre,
            limit: 10,
          });
          allEvents.push(...result.performances);

        } else {
          // search_events_by_location
          const result = await this.kopisService.searchEventsByLocation({
            genreCode: genre,
            startDate,
            endDate,
            sidoCode: sidoCode,
            limit: 10,
          });
          allEvents.push(...result.events);
        }
      } catch (error) {
        // 개별 장르 검색 실패는 무시하고 계속 진행
        console.error(`Failed to fetch genre ${genre}:`, error);
      }
    }

    const events = this.deduplicateEvents(allEvents);

    // ✅ 유틸리티 함수 사용
    relaxed.push(`위치: ${getSidoNameFull(sidoCode)} 전체`);
    relaxed.push(`장르: 모든 장르`);
    relaxed.push(`날짜: 한달 이내 (${startDate} ~ ${endDate})`);

    return { events, relaxed };
  }

  /**
   * 도구별 fetch 분기
   */
  private async fetchByTool(toolName: string, args: any): Promise<any[]> {
    if (toolName === 'filter_free_events') {
      const result = await this.kopisService.filterFreeEvents({
        genreCode: args.genreCode,
        sidoCode: args.sidoCode,
        limit: args.limit || 50,
      });
      return result.events;

    } else if (toolName === 'get_trending_performances') {
      const result = await this.kopisService.getTrendingPerformances({
        genreCode: args.genreCode,
        limit: args.limit || 50,
      });
      return result.performances;

    } else {
      // search_events_by_location
      const result = await this.kopisService.searchEventsByLocation({
        genreCode: args.genreCode,
        startDate: args.startDate,
        endDate: args.endDate,
        sidoCode: args.sidoCode,
        gugunCode: args.gugunCode,
        limit: args.limit || 50,
      });
      return result.events;
    }
  }

  /**
   * 결과 포맷팅 (점수 계산 포함)
   */
  private formatResult(
    events: any[],
    level: number,
    relaxed: string[],
    analysis: any,
    outputLimit: number
  ): SmartSearchResult {
    // 점수 계산 및 정렬
    const scored = this.scoreCalculator.scoreAndSort(
      events,
      analysis.priorities,
      {
        targetDate: analysis.parsedParams.startDate ? {
          start: analysis.parsedParams.startDate,
          end: analysis.parsedParams.endDate || analysis.parsedParams.startDate,
        } : undefined,
        targetLocation: analysis.parsedParams.gugunCode || analysis.parsedParams.sidoCode,
        targetGenre: analysis.parsedParams.genreCode,
        isFree: analysis.keywords.isFree,
      }
    );

    // 상위 N개만 선택 (출력 개수 기준)
    const topEvents = scored.slice(0, outputLimit).map(s => s.event);

    const message = level === 0
      ? this.generateFailureMessage(analysis.parsedParams.minCount || 3, topEvents.length)
      : this.generateMessage(level, relaxed, topEvents.length, outputLimit);

    return {
      events: topEvents,
      level,
      relaxedConditions: relaxed,
      message,
      scores: scored.slice(0, outputLimit),
    };
  }

  /**
   * 메시지 생성
   */
  private generateMessage(level: number, relaxed: string[], count: number, _minCount: number): string {
    if (level === 1) {
      return `✅ 요청 조건에 완벽히 맞는 공연 ${count}개를 찾았습니다!`;
    }

    const levelMessages = [
      '', // level 0 (unused)
      '', // level 1 (handled above)
      `🔍 조건을 일부 완화하여 ${count}개의 공연을 찾았습니다.`,
      `🔎 더 많은 선택지를 위해 조건을 확장했습니다. ${count}개의 공연을 찾았습니다.`,
      `🌐 최대 범위로 검색하여 ${count}개의 공연을 찾았습니다.`,
    ];

    const message = levelMessages[level];
    const conditions = relaxed.map(c => `  • ${c}`).join('\n');

    return `${message}\n\n완화된 조건:\n${conditions}`;
  }

  /**
   * 실패 메시지
   */
  private generateFailureMessage(minCount: number, foundCount: number): string {
    return `❌ 죄송합니다. 조건에 맞는 공연을 ${minCount}개 이상 찾지 못했습니다. (${foundCount}개 발견)

다음과 같이 시도해보세요:
  • 기간을 더 길게 설정 (예: 다음달까지)
  • 최소 개수를 줄여서 검색 (1~2개)
  • 지역 제한 없이 전국 검색`;
  }

  /**
   * 관련 장르들 반환 (원래 장르 포함)
   */
  private getRelatedGenres(genreCode: string): string[] {
    const map: Record<string, string[]> = {
      'AAAA': ['AAAA', 'GGGA'],           // 연극 + 뮤지컬
      'GGGA': ['GGGA', 'AAAA'],           // 뮤지컬 + 연극
      'CCCA': ['CCCA', 'CCCC'],           // 클래식 + 국악
      'CCCC': ['CCCC', 'CCCA'],           // 국악 + 클래식
      'BBBC': ['BBBC', 'BBBE'],           // 무용 + 대중무용
      'BBBE': ['BBBE', 'BBBC'],           // 대중무용 + 무용
      'CCCD': ['CCCD'],                   // 대중음악 (단독)
      'EEEA': ['EEEA', 'EEEB'],           // 복합 + 서커스
      'EEEB': ['EEEB', 'EEEA'],           // 서커스 + 복합
    };
    return map[genreCode] || [genreCode];
  }

  /**
   * 중복 제거
   */
  private deduplicateEvents(events: any[]): any[] {
    const seen = new Set<string>();
    return events.filter(event => {
      if (seen.has(event.mt20id)) return false;
      seen.add(event.mt20id);
      return true;
    });
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
}