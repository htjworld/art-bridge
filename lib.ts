import { parseStringPromise } from 'xml2js';

// Global API key
let apiKey: string = '';

export function setApiKey(key: string): void {
  apiKey = key;
}

export function getApiKey(): string {
  return apiKey;
}

// Genre codes mapping
export const GENRE_CODES = {
  'AAAA': '연극',
  'BBBC': '무용(서양/한국무용)',
  'BBBE': '대중무용',
  'CCCA': '서양음악(클래식)',
  'CCCC': '한국음악(국악)',
  'CCCD': '대중음악',
  'EEEA': '복합',
  'EEEB': '서커스/마술',
  'GGGA': '뮤지컬'
} as const;

export const GENRE_NAMES = Object.entries(GENRE_CODES).reduce((acc, [code, name]) => {
  acc[name] = code;
  return acc;
}, {} as Record<string, string>);

// Type definitions
export interface PerformanceListItem {
  mt20id: string;
  prfnm: string;
  prfpdfrom: string;
  prfpdto: string;
  fcltynm: string;
  poster: string;
  area: string;
  genrenm: string;
  openrun?: string;
  prfstate: string;
}

export interface PerformanceDetail {
  mt20id: string;
  prfnm: string;
  prfpdfrom: string;
  prfpdto: string;
  fcltynm: string;
  prfcast: string;
  prfcrew: string;
  prfruntime: string;
  prfage: string;
  entrpsnm: string;
  pcseguidance: string;
  poster: string;
  area: string;
  genrenm: string;
  openrun: string;
  prfstate: string;
  styurls: string[];
  dtguidance: string;
  relates: Array<{
    relatenm: string;
    relateurl: string;
  }>;
}

export interface FreeEvent extends PerformanceListItem {
  pcseguidance: string;
}

export interface TrendingEvent extends PerformanceListItem {
  isClosingSoon: boolean;
  daysUntilClose: number;
  popularity: number;
  finalScore: number;
}

export interface SearchParams {
  genreCode: string;
  startDate: string;
  endDate: string;
  sidoCode?: string;
  gugunCode?: string;
  limit?: number;
}

export interface FreeEventParams {
  genreCode: string;
  startDate: string;
  endDate: string;
  sidoCode?: string;
  limit?: number;
}

export interface TrendingParams {
  genreCode?: string;
  limit?: number;
}

// Utility Functions
export function getGenreList(): string[] {
  return Object.entries(GENRE_CODES).map(([code, name]) => `${code}: ${name}`);
}

function parseDate(dateStr: string): Date {
  // Format: YYYY.MM.DD
  const parts = dateStr.split('.');
  return new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
}

function getDaysUntilClose(endDateStr: string): number {
  const endDate = parseDate(endDateStr);
  const today = new Date();
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getTodayYYYYMMDD(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// API Functions
async function fetchKopisApi(endpoint: string, params: Record<string, string> = {}): Promise<string> {
  const baseUrl = 'http://www.kopis.or.kr/openApi/restful';
  const queryParams = new URLSearchParams({
    service: apiKey,
    ...params
  });
  
  const url = `${baseUrl}${endpoint}?${queryParams.toString()}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`KOPIS API 요청 실패: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`KOPIS API 호출 중 오류: ${errorMessage}`);
  }
}

async function parseXmlResponse<T>(xml: string): Promise<T> {
  try {
    const result = await parseStringPromise(xml, {
      explicitArray: false,
      mergeAttrs: true
    });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`XML 파싱 오류: ${errorMessage}`);
  }
}

export async function searchEventsByLocation(params: SearchParams): Promise<PerformanceListItem[]> {
  const apiParams: Record<string, string> = {
    stdate: params.startDate,
    eddate: params.endDate,
    cpage: '1',
    rows: String(params.limit || 5),
    shcate: params.genreCode
  };

  if (params.sidoCode) {
    apiParams.signgucode = params.sidoCode;
  }

  if (params.gugunCode) {
    apiParams.signgucodesub = params.gugunCode;
  }

  const xml = await fetchKopisApi('/pblprfr', apiParams);
  const result = await parseXmlResponse<any>(xml);

  if (!result.dbs || !result.dbs.db) {
    return [];
  }

  const items = Array.isArray(result.dbs.db) ? result.dbs.db : [result.dbs.db];
  
  return items.map((item: any) => ({
    mt20id: item.mt20id || '',
    prfnm: item.prfnm || '',
    prfpdfrom: item.prfpdfrom || '',
    prfpdto: item.prfpdto || '',
    fcltynm: item.fcltynm || '',
    poster: item.poster || '',
    area: item.area || '',
    genrenm: item.genrenm || '',
    openrun: item.openrun || '',
    prfstate: item.prfstate || ''
  }));
}

export async function getEventDetail(eventId: string): Promise<PerformanceDetail> {
  const xml = await fetchKopisApi(`/pblprfr/${eventId}`);
  const result = await parseXmlResponse<any>(xml);

  if (!result.dbs || !result.dbs.db) {
    throw new Error('공연 상세 정보를 찾을 수 없습니다.');
  }

  const item = result.dbs.db;

  // Parse styurls
  let styurls: string[] = [];
  if (item.styurls && item.styurls.styurl) {
    styurls = Array.isArray(item.styurls.styurl) 
      ? item.styurls.styurl 
      : [item.styurls.styurl];
  }

  // Parse relates
  let relates: Array<{ relatenm: string; relateurl: string }> = [];
  if (item.relates && item.relates.relate) {
    const relateArray = Array.isArray(item.relates.relate) 
      ? item.relates.relate 
      : [item.relates.relate];
    relates = relateArray.map((r: any) => ({
      relatenm: r.relatenm || '',
      relateurl: r.relateurl || ''
    }));
  }

  return {
    mt20id: item.mt20id || '',
    prfnm: item.prfnm || '',
    prfpdfrom: item.prfpdfrom || '',
    prfpdto: item.prfpdto || '',
    fcltynm: item.fcltynm || '',
    prfcast: item.prfcast || '',
    prfcrew: item.prfcrew || '',
    prfruntime: item.prfruntime || '',
    prfage: item.prfage || '',
    entrpsnm: item.entrpsnm || '',
    pcseguidance: item.pcseguidance || '',
    poster: item.poster || '',
    area: item.area || '',
    genrenm: item.genrenm || '',
    openrun: item.openrun || '',
    prfstate: item.prfstate || '',
    styurls,
    dtguidance: item.dtguidance || '',
    relates
  };
}

export async function filterFreeEvents(params: FreeEventParams): Promise<FreeEvent[]> {
  // First, get the event list
  const events = await searchEventsByLocation({
    genreCode: params.genreCode,
    startDate: params.startDate,
    endDate: params.endDate,
    sidoCode: params.sidoCode,
    limit: 50 // Fetch more to ensure we get enough free events
  });

  const freeEvents: FreeEvent[] = [];
  const limit = params.limit || 5;

  // Check each event's detail to see if it's free
  for (const event of events) {
    if (freeEvents.length >= limit) {
      break;
    }

    try {
      const detail = await getEventDetail(event.mt20id);
      
      // Check if the event is free
      const isFree = detail.pcseguidance && 
        (detail.pcseguidance.includes('무료') || 
         detail.pcseguidance.includes('0원') ||
         detail.pcseguidance.toLowerCase().includes('free'));

      if (isFree) {
        freeEvents.push({
          ...event,
          pcseguidance: detail.pcseguidance
        });
      }
    } catch (error) {
      // Skip events that fail to fetch details
      console.error(`Failed to fetch detail for ${event.mt20id}:`, error);
      continue;
    }
  }

  return freeEvents;
}

async function getBoxOfficeRankings(genreCode?: string): Promise<Map<string, number>> {
  const today = getTodayYYYYMMDD();
  
  const apiParams: Record<string, string> = {
    ststype: 'week',
    date: today,
    catecode: genreCode || ''
  };

  try {
    const xml = await fetchKopisApi('/boxoffice', apiParams);
    const result = await parseXmlResponse<any>(xml);

    const rankMap = new Map<string, number>();

    if (!result.boxofs || !result.boxofs.boxof) {
      return rankMap;
    }

    const items = Array.isArray(result.boxofs.boxof) ? result.boxofs.boxof : [result.boxofs.boxof];
    
    // 순위를 인기도로 변환 (1위=100, 10위=10, 선형 변환)
    items.forEach((item: any, index: number) => {
      const mt20id = item.mt20id || '';
      const rank = parseInt(item.rnum || String(index + 1));
      
      // 1위 = 100점, 순위가 낮아질수록 점수 감소
      // 최소 10위까지만 유효한 점수 부여
      let popularity = 0;
      if (rank <= 10) {
        popularity = 100 - ((rank - 1) * 10);
      } else if (rank <= 20) {
        popularity = 10 - ((rank - 10) * 0.5);
      }
      
      rankMap.set(mt20id, Math.max(0, popularity));
    });

    return rankMap;
  } catch (error) {
    console.error('박스오피스 API 호출 실패:', error);
    return new Map<string, number>();
  }
}

export async function getTrendingPerformances(params: TrendingParams): Promise<TrendingEvent[]> {
  const today = new Date();
  const startDate = today.toISOString().split('T')[0].replace(/-/g, '');
  const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0].replace(/-/g, '');

  // 박스오피스 순위 가져오기
  const boxOfficeRankings = await getBoxOfficeRankings(params.genreCode);

  // Get current performances
  const events = await searchEventsByLocation({
    genreCode: params.genreCode || '',
    startDate,
    endDate,
    limit: 50 // Fetch more to get diverse results
  });

  // Calculate popularity and final score
  const trendingEvents: TrendingEvent[] = events.map(event => {
    const daysUntilClose = getDaysUntilClose(event.prfpdto);
    const isClosingSoon = daysUntilClose <= 14 && daysUntilClose >= 0;
    
    // 인기도: 박스오피스에 있으면 해당 점수, 없으면 0
    const popularity = boxOfficeRankings.get(event.mt20id) || 0;
    
    // 최종 점수 = 인기도(0-100) + 마감임박 가산점(+10)
    const closingBonus = isClosingSoon ? 10 : 0;
    const finalScore = popularity + closingBonus;
    
    return {
      ...event,
      isClosingSoon,
      daysUntilClose,
      popularity,
      finalScore
    };
  });

  // Sort by final score (인기도 + 마감임박 가산점)
  trendingEvents.sort((a, b) => b.finalScore - a.finalScore);

  const limit = params.limit || 5;
  return trendingEvents.slice(0, limit);
}