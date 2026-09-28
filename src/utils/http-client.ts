import axios, { AxiosRequestConfig } from 'axios';

const DEFAULT_TIMEOUT = 5000;         // ms
const MAX_RETRIES = 2;                // 최초 시도 외 추가 2회
const RETRY_BASE_DELAY = 300;         // ms, 시도마다 선형 증가
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '300000', 10); // 기본 5분
const MAX_CACHE_ENTRIES = 500;        // ponytail: 단순 상한. LRU 아님(삽입순 최오래된 것 제거)

interface CacheEntry { data: string; expiry: number; }
const cache = new Map<string, CacheEntry>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isRetryable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true; // 타임아웃
  if (!err.response) return true;                 // 네트워크 에러(응답 없음)
  return err.response.status >= 500;              // 서버 에러
}

/**
 * 캐시 + 재시도 GET. KOPIS는 XML 문자열을 반환하므로 res.data는 string.
 * 캐시 키 = url 전체(쿼리+API키 포함, 서버 사이드 전용이라 안전).
 */
export async function cachedGet(url: string, config: AxiosRequestConfig = {}): Promise<string> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.expiry > now) return hit.data;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.get(url, { timeout: DEFAULT_TIMEOUT, ...config });
      const data = res.data as string;

      if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value; // 삽입순 가장 오래된 키
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(url, { data, expiry: now + CACHE_TTL_MS });
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        await sleep(RETRY_BASE_DELAY * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// 테스트/운영용
export function clearHttpCache(): void { cache.clear(); }
export function httpCacheSize(): number { return cache.size; }
