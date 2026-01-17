import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

interface SearchParams {
  genreCode: string;
  startDate: string;
  endDate: string;
  sidoCode?: string;
  gugunCode?: string;
  limit?: number;
}

interface FreeEventsParams {
  genreCode: string;
  startDate?: string;
  endDate?: string;
  sidoCode?: string;
  limit?: number;
}

interface TrendingParams {
  genreCode?: string;
  limit?: number;
}

const MAX_RESPONSE_SIZE = 24000; // 24KB limit (leaving buffer for markdown formatting)

export class KopisService {
  private readonly baseUrl = 'http://www.kopis.or.kr/openApi/restful';
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  constructor(private apiKey: string) {}

  getGenreList() {
    return [
      { code: 'AAAA', name: '연극' },
      { code: 'BBBC', name: '무용(서양/한국무용)' },
      { code: 'BBBE', name: '대중무용' },
      { code: 'CCCA', name: '서양음악(클래식)' },
      { code: 'CCCC', name: '한국음악(국악)' },
      { code: 'CCCD', name: '대중음악' },
      { code: 'EEEA', name: '복합' },
      { code: 'EEEB', name: '서커스/마술' },
      { code: 'GGGA', name: '뮤지컬' },
    ];
  }

  formatGenreListMarkdown(genres: any[]): string {
    let markdown = '# 🎭 공연 장르 목록\n\n';
    
    genres.forEach(genre => {
      markdown += `- **${genre.code}**: ${genre.name}\n`;
    });
    
    markdown += '\n> 장르 코드를 사용하여 원하는 공연을 검색할 수 있습니다.\n';
    
    return this.truncateIfNeeded(markdown);
  }

  formatEventsMarkdown(data: any): string {
    const { events, message } = data;
    
    let markdown = `# 🎪 공연 검색 결과\n\n`;
    markdown += `> ${message}\n\n`;
    
    if (events.length === 0) {
      markdown += '검색 결과가 없습니다.\n';
      return markdown;
    }

    markdown += `**총 ${events.length}개의 공연**\n\n`;
    markdown += `---\n\n`;

    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      markdown += `## ${index + 1}. ${event.prfnm || '제목 없음'}\n\n`;
      
      if (event.poster) {
        markdown += `![포스터](${event.poster})\n\n`;
      }
      
      markdown += `- 📅 **공연기간**: ${event.prfpdfrom || ''} ~ ${event.prfpdto || ''}\n`;
      markdown += `- 🏛️ **공연장**: ${event.fcltynm || '정보 없음'}\n`;
      markdown += `- 🎭 **장르**: ${event.genrenm || '정보 없음'}\n`;
      markdown += `- 📍 **지역**: ${event.area || '정보 없음'}\n`;
      
      if (event.prfstate) {
        const stateEmoji = event.prfstate === '공연중' ? '🟢' : event.prfstate === '공연예정' ? '🔵' : '⚫';
        markdown += `- ${stateEmoji} **상태**: ${event.prfstate}\n`;
      }
      
      markdown += `- 🔗 **공연ID**: \`${event.mt20id}\` (상세정보 조회 시 사용)\n`;
      markdown += `\n---\n\n`;

      // Check size and truncate if needed
      if (markdown.length > MAX_RESPONSE_SIZE * 0.8) {
        markdown += `\n> ⚠️ 결과가 너무 많아 ${index + 1}개까지만 표시합니다.\n`;
        break;
      }
    }

    return this.truncateIfNeeded(markdown);
  }

  formatFreeEventsMarkdown(data: any): string {
    const { events, freeCount, paidCount, message, dateRange } = data;
    
    let markdown = `# 🎁 무료/저렴한 공연 추천\n\n`;
    markdown += `> ${message}\n`;
    markdown += `> 📅 검색 기간: ${dateRange}\n\n`;
    
    if (events.length === 0) {
      markdown += '검색 결과가 없습니다.\n';
      return markdown;
    }

    markdown += `**무료 공연 ${freeCount}개 | 유료 공연 ${paidCount}개**\n\n`;
    markdown += `---\n\n`;

    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      const isFree = event.pcseguidance?.toLowerCase().includes('무료') || 
                     event.pcseguidance === '0' || 
                     event.pcseguidance === '0원';
      
      markdown += `## ${index + 1}. ${isFree ? '🎁 [무료]' : '💰'} ${event.prfnm || '제목 없음'}\n\n`;
      
      if (event.poster) {
        markdown += `![포스터](${event.poster})\n\n`;
      }
      
      markdown += `- 📅 **공연기간**: ${event.prfpdfrom || ''} ~ ${event.prfpdto || ''}\n`;
      markdown += `- 🏛️ **공연장**: ${event.fcltynm || '정보 없음'}\n`;
      markdown += `- 💵 **관람료**: ${event.pcseguidance || '정보 없음'}\n`;
      markdown += `- 🎭 **장르**: ${event.genrenm || '정보 없음'}\n`;
      markdown += `- 🔗 **공연ID**: \`${event.mt20id}\`\n`;
      markdown += `\n---\n\n`;

      if (markdown.length > MAX_RESPONSE_SIZE * 0.8) {
        markdown += `\n> ⚠️ 결과가 너무 많아 ${index + 1}개까지만 표시합니다.\n`;
        break;
      }
    }

    return this.truncateIfNeeded(markdown);
  }

  formatEventDetailMarkdown(detail: any): string {
    if (!detail) {
      return '# ❌ 공연 정보를 찾을 수 없습니다.\n';
    }

    let markdown = `# 🎭 ${detail.prfnm || '공연 상세정보'}\n\n`;
    
    if (detail.poster) {
      markdown += `![공연 포스터](${detail.poster})\n\n`;
    }

    markdown += `## 📋 기본 정보\n\n`;
    markdown += `- 🎭 **장르**: ${detail.genrenm || '정보 없음'}\n`;
    markdown += `- 📅 **공연기간**: ${detail.prfpdfrom || ''} ~ ${detail.prfpdto || ''}\n`;
    markdown += `- 🏛️ **공연장**: ${detail.fcltynm || '정보 없음'}\n`;
    markdown += `- ⏱️ **공연시간**: ${detail.prfruntime || '정보 없음'}\n`;
    markdown += `- 🔞 **관람연령**: ${detail.prfage || '정보 없음'}\n`;
    
    if (detail.prfstate) {
      const stateEmoji = detail.prfstate === '공연중' ? '🟢' : detail.prfstate === '공연예정' ? '🔵' : '⚫';
      markdown += `- ${stateEmoji} **공연상태**: ${detail.prfstate}\n`;
    }

    markdown += `\n## 💰 관람료\n\n`;
    if (detail.pcseguidance) {
      const prices = detail.pcseguidance.split(',').map((p: string) => p.trim());
      prices.forEach((price: string) => {
        markdown += `- ${price}\n`;
      });
    } else {
      markdown += '정보 없음\n';
    }

    if (detail.prfcast) {
      markdown += `\n## 🎬 출연진\n\n`;
      markdown += `${detail.prfcast}\n`;
    }

    if (detail.sty && detail.sty.length > 100) {
      markdown += `\n## 📖 시놉시스\n\n`;
      const synopsis = this.cleanHtml(detail.sty);
      markdown += `${synopsis.substring(0, 1000)}${synopsis.length > 1000 ? '...' : ''}\n`;
    }

    if (detail.dtguidance) {
      markdown += `\n## 📍 공연 시간 안내\n\n`;
      markdown += `${detail.dtguidance}\n`;
    }

    markdown += `\n## 🔗 예매 정보\n\n`;
    if (detail.relates?.relate) {
      const relates = Array.isArray(detail.relates.relate) ? detail.relates.relate : [detail.relates.relate];
      relates.forEach((relate: any) => {
        if (relate.relatenm && relate.relateurl) {
          markdown += `- [${relate.relatenm}](${relate.relateurl})\n`;
        }
      });
    } else {
      markdown += '예매 링크 정보가 없습니다.\n';
    }

    markdown += `\n---\n`;
    markdown += `\n> 공연 ID: \`${detail.mt20id}\`\n`;

    return this.truncateIfNeeded(markdown);
  }

  formatTrendingMarkdown(data: any): string {
    const { performances, count, message, scoreInfo } = data;
    
    let markdown = `# 🔥 인기 공연 추천\n\n`;
    markdown += `> ${message}\n`;
    markdown += `> ${scoreInfo}\n\n`;
    
    if (performances.length === 0) {
      markdown += '추천할 공연이 없습니다.\n';
      return markdown;
    }

    markdown += `**총 ${count}개의 인기 공연**\n\n`;
    markdown += `---\n\n`;

    for (let index = 0; index < performances.length; index++) {
      const perf = performances[index];
      markdown += `## ${perf.rank}위. ${perf.indicators} ${perf.prfnm || '제목 없음'}\n\n`;
      
      if (perf.poster) {
        markdown += `![포스터](${perf.poster})\n\n`;
      }
      
      markdown += `- 🏆 **인기도**: ${perf.popularityScore}점\n`;
      markdown += `- 📅 **공연기간**: ${perf.prfpd || '정보 없음'}\n`;
      
      if (perf.daysUntilEnd <= 14) {
        markdown += `- ⏰ **마감까지**: ${perf.daysUntilEnd}일 남음\n`;
      }
      
      markdown += `- 🏛️ **공연장**: ${perf.prfplcnm || '정보 없음'}\n`;
      markdown += `- 🎭 **장르**: ${perf.cate || '정보 없음'}\n`;
      markdown += `- 📍 **지역**: ${perf.area || '정보 없음'}\n`;
      markdown += `- 🔗 **공연ID**: \`${perf.mt20id}\`\n`;
      markdown += `\n---\n\n`;

      if (markdown.length > MAX_RESPONSE_SIZE * 0.8) {
        markdown += `\n> ⚠️ 결과가 너무 많아 ${index + 1}개까지만 표시합니다.\n`;
        break;
      }
    }

    return this.truncateIfNeeded(markdown);
  }

  async searchEventsByLocation(params: SearchParams) {
    const { genreCode, startDate, endDate, sidoCode, gugunCode, limit = 20 } = params;

    // Validate limit
    const validLimit = Math.min(Math.max(limit, 1), 50);

    // Level 1: 구/군 단위 검색
    if (gugunCode && sidoCode) {
      const results = await this.fetchEvents({
        genreCode,
        startDate,
        endDate,
        signguCode: gugunCode,
        limit: validLimit,
      });
      if (results.length > 0) {
        return {
          events: results,
          searchLevel: 'gugun',
          message: `${gugunCode} 구/군에서 ${results.length}개의 공연을 찾았습니다.`,
        };
      }
    }

    // Level 2: 시/도 단위 검색
    if (sidoCode) {
      const results = await this.fetchEvents({
        genreCode,
        startDate,
        endDate,
        signguCode: sidoCode,
        limit: validLimit,
      });
      if (results.length > 0) {
        return {
          events: results,
          searchLevel: 'sido',
          message: `구/군 검색 결과가 없어 시/도 범위로 확장했습니다. ${results.length}개의 공연을 찾았습니다.`,
        };
      }
    }

    // Level 3: 전국 검색
    const results = await this.fetchEvents({
      genreCode,
      startDate,
      endDate,
      limit: validLimit,
    });
    return {
      events: results,
      searchLevel: 'nationwide',
      message: `지역 검색 결과가 없어 전국 범위로 확장했습니다. ${results.length}개의 공연을 찾았습니다.`,
    };
  }

  async filterFreeEvents(params: FreeEventsParams) {
    const { genreCode, sidoCode, limit = 20 } = params;

    // Validate limit
    const validLimit = Math.min(Math.max(limit, 1), 50);

    // Always use today + 30 days
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);

    const startDate = this.formatDate(today);
    const endDateStr = this.formatDate(endDate);

    // Fetch all events
    const events = await this.fetchEvents({
      genreCode,
      startDate,
      endDate: endDateStr,
      signguCode: sidoCode,
      limit: 100, // Fetch more to filter
    });

    // Separate free and paid events
    const freeEvents = events.filter((e: any) => 
      e.pcseguidance?.toLowerCase().includes('무료') || 
      e.pcseguidance === '0' ||
      e.pcseguidance === '0원'
    );

    const paidEvents = events.filter((e: any) => 
      !freeEvents.includes(e)
    ).sort((a: any, b: any) => {
      const priceA = this.extractMinPrice(a.pcseguidance);
      const priceB = this.extractMinPrice(b.pcseguidance);
      return priceA - priceB;
    });

    // Smart fallback logic
    let result = [];
    let message = '';

    if (freeEvents.length >= 10) {
      result = freeEvents.slice(0, validLimit);
      message = `${freeEvents.length}개의 무료 공연을 찾았습니다.`;
    } else if (freeEvents.length > 0) {
      const needed = Math.min(10, validLimit) - freeEvents.length;
      result = [...freeEvents, ...paidEvents.slice(0, needed)];
      message = `${freeEvents.length}개의 무료 공연과 ${needed}개의 저렴한 유료 공연을 찾았습니다.`;
    } else {
      result = paidEvents.slice(0, Math.min(10, validLimit));
      message = `무료 공연이 없어 가장 저렴한 ${result.length}개의 유료 공연을 추천합니다.`;
    }

    return {
      events: result,
      freeCount: freeEvents.length,
      paidCount: result.length - freeEvents.length,
      message,
      dateRange: `${startDate} ~ ${endDateStr}`,
    };
  }

  async getEventDetail(eventId: string) {
    try {
      const url = `${this.baseUrl}/pblprfr/${eventId}?service=${this.apiKey}`;
      const response = await axios.get(url);
      const parsed = this.parser.parse(response.data);
      
      return parsed.dbs?.db || null;
    } catch (error) {
      throw new Error(`Failed to fetch event detail: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getTrendingPerformances(params: TrendingParams) {
    const { genreCode, limit = 20 } = params;
    
    // Validate limit
    const validLimit = Math.min(Math.max(limit, 1), 50);
    
    const today = new Date();
    const targetDate = this.formatDate(today);

    try {
      // Fetch boxoffice data
      const url = `${this.baseUrl}/boxoffice?service=${this.apiKey}&ststype=week&date=${targetDate}&catecode=${genreCode || ''}`;
      const response = await axios.get(url);
      const parsed = this.parser.parse(response.data);

      let boxofficeList = parsed.boxofs?.boxof || [];
      if (!Array.isArray(boxofficeList)) {
        boxofficeList = boxofficeList ? [boxofficeList] : [];
      }

      // If no results and genreCode specified, retry without genreCode
      if (boxofficeList.length === 0 && genreCode) {
        const retryUrl = `${this.baseUrl}/boxoffice?service=${this.apiKey}&ststype=week&date=${targetDate}`;
        const retryResponse = await axios.get(retryUrl);
        const retryParsed = this.parser.parse(retryResponse.data);
        boxofficeList = retryParsed.boxofs?.boxof || [];
        if (!Array.isArray(boxofficeList)) {
          boxofficeList = boxofficeList ? [boxofficeList] : [];
        }
      }

      // Calculate popularity scores
      const rankedEvents = boxofficeList.map((item: any, index: number) => {
        const rank = index + 1;
        const baseScore = Math.max(0, 100 - (rank - 1) * 2);
        
        const endDate = item.prfpd?.split('~')[1]?.trim();
        const daysUntilEnd = endDate ? this.calculateDaysUntil(endDate) : 999;
        const urgencyBonus = daysUntilEnd <= 14 ? 10 : 0;
        
        const totalScore = baseScore + urgencyBonus;

        const popularityEmoji = totalScore >= 80 ? '⭐' : '';
        const urgencyEmoji = daysUntilEnd <= 7 ? '🔥' : '';

        return {
          ...item,
          rank,
          popularityScore: totalScore,
          daysUntilEnd,
          indicators: `${popularityEmoji}${urgencyEmoji}`.trim() || '-',
        };
      });

      rankedEvents.sort((a: any, b: any) => b.popularityScore - a.popularityScore);

      const result = rankedEvents.slice(0, validLimit);

      return {
        performances: result,
        count: result.length,
        message: genreCode 
          ? `${genreCode} 장르의 인기 공연 ${result.length}개를 찾았습니다.`
          : `전체 장르의 인기 공연 ${result.length}개를 찾았습니다.`,
        scoreInfo: '인기도: 1위=100점, 순위별 -2점, 14일 이내 종료시 +10점',
      };
    } catch (error) {
      throw new Error(`Failed to fetch trending performances: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fetchEvents(params: any) {
    try {
      const queryParams = new URLSearchParams({
        service: this.apiKey,
        stdate: params.startDate,
        eddate: params.endDate,
        cpage: '1',
        rows: String(params.limit || 20),
        shcate: params.genreCode,
      });

      if (params.signguCode) {
        queryParams.append('signgucode', params.signguCode);
      }

      const url = `${this.baseUrl}/pblprfr?${queryParams.toString()}`;
      const response = await axios.get(url);
      const parsed = this.parser.parse(response.data);

      let events = parsed.dbs?.db || [];
      if (!Array.isArray(events)) {
        events = events ? [events] : [];
      }

      return events;
    } catch (error) {
      throw new Error(`Failed to fetch events: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private extractMinPrice(priceStr: string): number {
    if (!priceStr) return Infinity;
    const matches = priceStr.match(/\d+/g);
    if (!matches) return Infinity;
    return Math.min(...matches.map(Number));
  }

  private calculateDaysUntil(endDateStr: string): number {
    try {
      const [year, month, day] = endDateStr.split('.').map(Number);
      const endDate = new Date(year, month - 1, day);
      const today = new Date();
      const diff = endDate.getTime() - today.getTime();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    } catch {
      return 999;
    }
  }

  private cleanHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  private truncateIfNeeded(text: string): string {
    if (text.length <= MAX_RESPONSE_SIZE) {
      return text;
    }

    const truncated = text.substring(0, MAX_RESPONSE_SIZE - 100);
    return truncated + '\n\n---\n\n> ⚠️ **응답이 너무 길어 일부가 생략되었습니다.**\n> 더 자세한 정보는 개별 공연 ID로 상세 조회를 이용해주세요.\n';
  }
}