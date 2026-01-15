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
  price: number;
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
  return Object.entries(GENRE_CODES).map(([code, name], index) => `${index + 1}. ${name} (${code})`);
}

function parseDate(dateStr: string): Date {
  // Format: YYYY.MM.DD
  const parts = dateStr.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
}

export function getDaysUntilClose(endDateStr: string): number {
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

function getDateAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// 가격 문자열에서 최저가 추출
function extractMinPrice(priceStr: string): number {
  if (!priceStr) return 999999;
  
  // 무료 체크
  if (priceStr.includes('무료') || priceStr.includes('0원') || priceStr.toLowerCase().includes('free')) {
    return 0;
  }
  
  // 숫자만 추출
  const numbers = priceStr.match(/\d+/g);
  if (!numbers || numbers.length === 0) return 999999;
  
  // 가장 작은 숫자 반환 (최저가)
  return Math.min(...numbers.map(n => parseInt(n)));
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
  // 30일 이내로 고정
  const today = getTodayYYYYMMDD();
  const endDate = getDateAfterDays(30);

  // First, get the event list
  const events = await searchEventsByLocation({
    genreCode: params.genreCode,
    startDate: today,        // 고정값 사용
    endDate: endDate,        // 고정값 사용
    sidoCode: params.sidoCode,
    limit: 100
  });

  const allEventsWithPrice: FreeEvent[] = [];

  // 모든 이벤트의 가격 정보 수집
  for (const event of events) {
    try {
      const detail = await getEventDetail(event.mt20id);
      const price = extractMinPrice(detail.pcseguidance);
      
      allEventsWithPrice.push({
        ...event,
        pcseguidance: detail.pcseguidance,
        price
      });
      
      // 무료 공연 10개 또는 전체 50개 수집하면 조기 종료
      const freeCount = allEventsWithPrice.filter(e => e.price === 0).length;
      if (freeCount >= 10 || allEventsWithPrice.length >= 50) {
        break;
      }
    } catch (error) {
      console.error(`Failed to fetch detail for ${event.mt20id}:`, error);
      continue;
    }
  }

  // 지역 필터링 (sidoCode가 있는 경우)
  let filteredEvents = allEventsWithPrice;
  if (params.sidoCode) {
    filteredEvents = allEventsWithPrice.filter(event => {
      // area 필드에서 지역명 추출 (예: "서울특별시", "경기도" 등)
      const sidoMap: Record<string, string[]> = {
        '11': ['서울'],
        '26': ['부산'],
        '27': ['대구'],
        '28': ['인천'],
        '29': ['광주'],
        '30': ['대전'],
        '31': ['울산'],
        '36': ['세종'],
        '41': ['경기'],
        '42': ['강원'],
        '43': ['충청북도', '충북'],
        '44': ['충청남도', '충남'],
        '45': ['전라북도', '전북'],
        '46': ['전라남도', '전남'],
        '47': ['경상북도', '경북'],
        '48': ['경상남도', '경남'],
        '50': ['제주']
      };
      
      const areaKeywords = sidoMap[params.sidoCode!] || [];
      return areaKeywords.some(keyword => event.area.includes(keyword));
    });
  }

  // 가격순 정렬 (무료 우선, 그 다음 저렴한 순)
  filteredEvents.sort((a, b) => a.price - b.price);

  // 무료 공연만 추출
  const freeEvents = filteredEvents.filter(e => e.price === 0);
  
  // 무료 공연이 5개 미만이면 저렴한 유료 포함
  if (freeEvents.length < 5) {
    const cheapEvents = filteredEvents.filter(e => e.price > 0).slice(0, 10 - freeEvents.length);
    const result = [...freeEvents, ...cheapEvents].slice(0, 10);
    return result;
  }

  // 무료 공연이 5개 이상이면 무료만 10개
  return freeEvents.slice(0, 10);
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