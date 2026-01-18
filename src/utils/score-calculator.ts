import { PriorityWeights, EventScore } from '../types/search.types.js';
import { getGenreName, getAreaName, getSidoNameShort } from '../constants/kopis-codes.js';

/**
 * 우선순위 기반 공연 점수 계산기
 */
export class ScoreCalculator {
  
  /**
   * 공연 배열에 점수를 부여하고 정렬
   */
  scoreAndSort(
    events: any[],
    priorities: PriorityWeights,
    criteria: {
      targetDate?: { start: string; end: string };
      targetLocation?: string;
      targetGenre?: string;
      isFree?: boolean;
    }
  ): EventScore[] {
    const scored = events.map(event => this.calculateScore(event, priorities, criteria));
    return scored.sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * 개별 공연 점수 계산
   */
  private calculateScore(
    event: any,
    priorities: PriorityWeights,
    criteria: any
  ): EventScore {
    const breakdown = {
      priceScore: this.calculatePriceScore(event, criteria.isFree),
      dateScore: this.calculateDateScore(event, criteria.targetDate),
      genreScore: this.calculateGenreScore(event, criteria.targetGenre),
      locationScore: this.calculateLocationScore(event, criteria.targetLocation),
      popularityScore: event.popularityScore || 50,
    };

    // 우선순위별 가중치 적용
    const weights = {
      [priorities.first]: 0.4,
      [priorities.second]: 0.3,
      [priorities.third]: 0.2,
      [priorities.fourth || 'count']: 0.1,
    };

    const totalScore = 
      (breakdown.priceScore * (weights['price'] || 0)) +
      (breakdown.dateScore * (weights['date'] || 0)) +
      (breakdown.genreScore * (weights['genre'] || 0)) +
      (breakdown.locationScore * (weights['location'] || 0)) +
      (breakdown.popularityScore * (weights['popularity'] || 0));

    return {
      event,
      totalScore,
      breakdown,
    };
  }

  /**
   * 가격 점수 (0-100)
   */
  private calculatePriceScore(event: any, targetIsFree?: boolean): number {
    const priceStr = event.pcseguidance || '';
    
    // 무료 감지
    const isFree = 
      priceStr.toLowerCase().includes('무료') ||
      priceStr === '0' ||
      priceStr === '0원';

    if (isFree) {
      return 100; // 무료면 만점
    }

    // 최저가 추출
    const minPrice = this.extractMinPrice(priceStr);
    
    if (minPrice === Infinity) return 0;
    if (minPrice === 0) return 100;
    
    // 가격대별 점수 (역비례)
    if (minPrice <= 5000) return 80;
    if (minPrice <= 10000) return 60;
    if (minPrice <= 20000) return 40;
    if (minPrice <= 50000) return 20;
    return 10;
  }

  /**
   * 날짜 점수 (0-100)
   */
  private calculateDateScore(event: any, targetDate?: { start: string; end: string }): number {
    if (!targetDate) return 50; // 날짜 조건 없으면 중립

    const eventStart = event.prfpdfrom?.replace(/\./g, '') || '';
    const eventEnd = event.prfpdto?.replace(/\./g, '') || '';
    
    const targetStart = targetDate.start;
    const targetEnd = targetDate.end;

    // 완벽 일치 (공연 기간이 요청 기간 내에 완전히 포함)
    if (eventStart >= targetStart && eventEnd <= targetEnd) {
      return 100;
    }

    // 부분 일치 (공연 기간과 요청 기간이 겹침)
    if (eventStart <= targetEnd && eventEnd >= targetStart) {
      return 70;
    }

    // 날짜 차이 계산
    const diff = this.calculateDateDiff(targetStart, eventStart);
    
    if (diff <= 7) return 50;   // 1주일 차이
    if (diff <= 14) return 30;  // 2주일 차이
    if (diff <= 30) return 10;  // 1달 차이
    
    return 0;
  }

  /**
   * 장르 점수 (0-100)
   * 
   * KOPIS API는 genrenm 필드에 장르 **이름**을 반환 (예: "뮤지컬", "연극")
   * targetGenreCode는 장르 **코드** (예: "GGGA", "AAAA")
   */
  private calculateGenreScore(event: any, targetGenreCode?: string): number {
    if (!targetGenreCode) return 50;
    
    // API 응답의 장르명 (예: "뮤지컬")
    const eventGenreName = event.genrenm;
    
    if (!eventGenreName) return 0;
    
    // ✅ 유틸리티 함수 사용: 장르 코드 → 장르명 변환
    const targetGenreName = getGenreName(targetGenreCode);
    
    // 정확히 일치
    if (eventGenreName === targetGenreName) {
      return 100;
    }

    // 부분 일치 (예: "무용(서양/한국무용)"에서 "무용" 포함)
    if (eventGenreName.includes(targetGenreName) || targetGenreName.includes(eventGenreName)) {
      return 90;
    }

    // 비슷한 장르 매칭
    const similarPairs = [
      ['연극', '뮤지컬'],
      ['서양음악(클래식)', '한국음악(국악)'],
      ['무용(서양/한국무용)', '대중무용'],
      ['복합', '서커스/마술'],
    ];

    for (const pair of similarPairs) {
      if (pair.includes(eventGenreName) && pair.includes(targetGenreName)) {
        return 60;
      }
    }

    return 0;
  }

  /**
   * 위치 점수 (0-100)
   */
  private calculateLocationScore(event: any, targetLocation?: string): number {
    if (!targetLocation) return 50;

    const eventArea = event.area || '';
    
    // ✅ 유틸리티 함수 사용: 구/군 정확 일치 (4자리 코드)
    if (targetLocation.length === 4) {
      const areaName = getAreaName(targetLocation, true); // short=true
      if (eventArea.includes(areaName)) {
        return 100;
      }
    }

    // ✅ 유틸리티 함수 사용: 같은 시/도 (2자리 코드)
    if (targetLocation.length >= 2) {
      const sido = targetLocation.substring(0, 2);
      const sidoName = getSidoNameShort(sido);
      if (eventArea.includes(sidoName)) {
        return 60;
      }
    }

    return 0;
  }

  /**
   * 최저가 추출
   */
  private extractMinPrice(priceStr: string): number {
    if (!priceStr) return Infinity;
    const matches = priceStr.match(/\d+/g);
    if (!matches) return Infinity;
    return Math.min(...matches.map(Number));
  }

  /**
   * 날짜 차이 계산 (일 단위)
   */
  private calculateDateDiff(date1: string, date2: string): number {
    const d1 = new Date(
      parseInt(date1.substring(0, 4)),
      parseInt(date1.substring(4, 6)) - 1,
      parseInt(date1.substring(6, 8))
    );
    const d2 = new Date(
      parseInt(date2.substring(0, 4)),
      parseInt(date2.substring(4, 6)) - 1,
      parseInt(date2.substring(6, 8))
    );
    
    return Math.abs(Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }
}