#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import {
  GENRE_CODES,
  GENRE_NAMES,
  getGenreList,
  searchEventsByLocation,
  filterFreeEvents,
  getEventDetail,
  getTrendingPerformances,
  setApiKey,
  getDaysUntilClose,
} from './lib.js';

// Command line argument parsing
const defaultApiKey = process.env.KOPIS_API_KEY || process.argv[2] || '';

if (defaultApiKey) {
  setApiKey(defaultApiKey);
  console.error("Art-Bridge MCP Server initializing with default API key...");
} else {
  console.error("Art-Bridge MCP Server initializing (API key will be provided via request headers)...");
}

// Schema definitions
const GetGenreListArgsSchema = z.object({});

const SearchEventsByLocationArgsSchema = z.object({
  genreCode: z.string().describe('장르 코드 (예: AAAA-연극, GGGA-뮤지컬)'),
  startDate: z.string().describe('공연 시작일 (YYYYMMDD)'),
  endDate: z.string().describe('공연 종료일 (YYYYMMDD)'),
  sidoCode: z.string().optional().describe('시도 코드 (예: 11-서울, 41-경기)'),
  gugunCode: z.string().optional().describe('구군 코드 (예: 1111-강남구)'),
  limit: z.number().optional().default(15).describe('결과 개수 (권장: 데이터셋 많을 때 15-30개, 기본: 15)')
});

const FilterFreeEventsArgsSchema = z.object({
  genreCode: z.string().describe('장르 코드 (예: AAAA-연극, GGGA-뮤지컬)'),
  startDate: z.string().describe('공연 시작일 (YYYYMMDD)'),
  endDate: z.string().describe('공연 종료일 (YYYYMMDD)'),
  sidoCode: z.string().optional().describe('시도 코드 (예: 11-서울, 41-경기)'),
  limit: z.number().optional().default(10).describe('결과 개수 (권장: 데이터셋 많을 때 10개, 기본: 5)')
});

const GetEventDetailArgsSchema = z.object({
  eventId: z.string().describe('공연 ID (mt20id)')
});

const GetTrendingPerformancesArgsSchema = z.object({
  genreCode: z.string().optional().describe('장르 코드 (전체 조회 시 생략 가능)'),
  limit: z.number().optional().default(15).describe('결과 개수 (권장: 데이터셋 많을 때 15-30개, 기본: 15)')
});

// Server setup - 간단히 하나의 서버만 사용
const server = new McpServer(
  {
    name: "art-bridge-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool registrations

server.registerTool(
  "get_genre_list",
  {
    title: "장르 목록 조회",
    description:
      "사용자가 장르를 특정하지 않았을 때, 선택 가능한 모든 공연 장르 목록을 보여주는 도구입니다. " +
      "사용자에게 1-9번 번호와 장르명을 표시하여 선택하도록 안내하세요. " +
      "사용자가 번호나 장르명으로 응답하면, 해당하는 장르 코드(예: 1번 또는 '연극' → AAAA)를 사용하여 검색하세요.",
    inputSchema: {},
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
  },
  async (args: z.infer<typeof GetGenreListArgsSchema>) => {
    const genreList = getGenreList();
    const text = genreList.join('\n');
    return {
      content: [{ type: "text" as const, text }],
      structuredContent: { content: text }
    };
  }
);

server.registerTool(
  "search_events_by_location",
  {
    title: "지역별 공연 검색",
    description:
      "특정 지역과 기간의 공연을 검색합니다. " +
      "시도 코드와 구군 코드를 사용하여 원하는 지역의 공연을 찾을 수 있습니다. " +
      "**중요: limit은 15-30으로 설정하여 충분한 선택지를 확보하세요.** " +
      "검색 결과가 많으면 그 중 베스트 3-5개를 추천하고, 적으면 있는 만큼 추천하세요. " +
      "검색 결과가 없으면 조건을 완화한 대안을 제시하세요.",
    inputSchema: {
      genreCode: z.string().describe('장르 코드 (예: AAAA-연극, GGGA-뮤지컬)'),
      startDate: z.string().describe('공연 시작일 (YYYYMMDD)'),
      endDate: z.string().describe('공연 종료일 (YYYYMMDD)'),
      sidoCode: z.string().optional().describe('시도 코드 (예: 11-서울, 41-경기)'),
      gugunCode: z.string().optional().describe('구군 코드 (예: 1111-강남구)'),
      limit: z.number().optional().default(15).describe('결과 개수 (권장: 데이터셋 많을 때 15-30개, 기본: 15)')
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
  },
  async (args: z.infer<typeof SearchEventsByLocationArgsSchema>) => {
    try {
      const events = await searchEventsByLocation({
        genreCode: args.genreCode,
        startDate: args.startDate,
        endDate: args.endDate,
        sidoCode: args.sidoCode,
        gugunCode: args.gugunCode,
        limit: args.limit
      });

      if (events.length === 0) {
        const text = "검색 조건에 맞는 공연이 없습니다.";
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { content: text }
        };
      }

      const formatted = events.map((event, index) => 
        `${index + 1}. ${event.prfnm}\n` +
        `   공연장: ${event.fcltynm}\n` +
        `   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n` +
        `   장르: ${event.genrenm}\n` +
        `   지역: ${event.area}\n` +
        `   상태: ${event.prfstate}\n` +
        `   ID: ${event.mt20id}`
      ).join('\n\n');

      return {
        content: [{ type: "text" as const, text: formatted }],
        structuredContent: { content: formatted }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`공연 검색 중 오류 발생: ${errorMessage}`);
    }
  }
);

server.registerTool(
  "filter_free_events",
  {
    title: "무료 공연 검색",
    description:
      "무료 공연만 필터링하여 검색합니다. " +
      "공연 목록을 가져온 후 각 공연의 상세 정보를 확인하여 무료 공연만 반환합니다.\n\n" +
      "**중요 - 날짜 설정:**\n" +
      "- 사용자가 날짜를 지정하지 않으면: 오늘부터 30일 이내 공연 중 오늘/내일에 공연이 있는 것을 우선 추천\n" +
      "- 사용자가 '오늘', '내일', '이번주', '다음주' 등을 지정하면: 해당 기간에 맞춰 startDate/endDate 계산\n\n" +
      "**중요 - 결과 처리:**\n" +
      "- 이 도구는 항상 5-10개의 결과를 반환합니다 (limit 파라미터 사용)\n" +
      "- 최종 답변 시: 그 중 베스트 3-5개만 선택하여 사용자에게 추천\n" +
      "- 결과가 3-5개 미만이면: 있는 만큼만 추천\n" +
      "- 결과가 없으면: 유료 공연 중 저렴한 것을 대안으로 제시",
    inputSchema: {
      genreCode: z.string().describe('장르 코드 (예: AAAA-연극, GGGA-뮤지컬)'),
      startDate: z.string().describe('공연 시작일 (YYYYMMDD)'),
      endDate: z.string().describe('공연 종료일 (YYYYMMDD)'),
      sidoCode: z.string().optional().describe('시도 코드 (예: 11-서울, 41-경기)'),
      limit: z.number().optional().default(5).describe('결과 개수 (기본: 5)')
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
  },
  async (args: z.infer<typeof FilterFreeEventsArgsSchema>) => {
    try {
      const events = await filterFreeEvents({
        genreCode: args.genreCode,
        startDate: args.startDate,
        endDate: args.endDate,
        sidoCode: args.sidoCode,
        limit: args.limit
      });

      if (events.length === 0) {
        const text = "검색 조건에 맞는 무료 공연이 없습니다.";
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { content: text }
        };
      }

      const formatted = events.map((event, index) => {
        const daysLeft = getDaysUntilClose(event.prfpdto);
        const closingBadge = daysLeft <= 7 && daysLeft >= 0 ? ' 🔥 마감임박!' : '';
        
        return (
          `${index + 1}. ${event.prfnm}${closingBadge}\n` +
          `   공연장: ${event.fcltynm}\n` +
          `   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n` +
          `   장르: ${event.genrenm}\n` +
          `   지역: ${event.area}\n` +
          `   관람료: ${event.pcseguidance}\n` +
          `   ID: ${event.mt20id}`
        );
      }).join('\n\n');

      return {
        content: [{ type: "text" as const, text: formatted }],
        structuredContent: { content: formatted }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`무료 공연 검색 중 오류 발생: ${errorMessage}`);
    }
  }
);

server.registerTool(
  "get_event_detail",
  {
    title: "공연 상세 정보 조회",
    description:
      "공연 ID를 사용하여 상세 정보를 조회합니다. " +
      "시놉시스, 출연진, 관람료, 공연 시간, 연령 제한 등의 자세한 정보를 제공합니다.",
    inputSchema: {
      eventId: z.string().describe('공연 ID (mt20id)')
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
  },
  async (args: z.infer<typeof GetEventDetailArgsSchema>) => {
    try {
      const detail = await getEventDetail(args.eventId);

      const formatted = 
        `=== ${detail.prfnm} ===\n\n` +
        `공연 기간: ${detail.prfpdfrom} ~ ${detail.prfpdto}\n` +
        `공연장: ${detail.fcltynm}\n` +
        `장르: ${detail.genrenm}\n` +
        `상태: ${detail.prfstate}\n\n` +
        `출연진: ${detail.prfcast || '정보 없음'}\n` +
        `크루: ${detail.prfcrew || '정보 없음'}\n` +
        `공연 시간: ${detail.prfruntime || '정보 없음'}\n` +
        `관람 연령: ${detail.prfage || '정보 없음'}\n` +
        `관람료: ${detail.pcseguidance || '정보 없음'}\n\n` +
        `제작사: ${detail.entrpsnm || '정보 없음'}\n` +
        `공연 시간표: ${detail.dtguidance || '정보 없음'}\n\n` +
        `포스터: ${detail.poster}\n` +
        (detail.styurls.length > 0 ? `상세 이미지:\n${detail.styurls.map((url, i) => `  ${i + 1}. ${url}`).join('\n')}\n` : '') +
        (detail.relates.length > 0 ? `\n예매 링크:\n${detail.relates.map((r, i) => `  ${i + 1}. ${r.relatenm}: ${r.relateurl}`).join('\n')}` : '');

      return {
        content: [{ type: "text" as const, text: formatted }],
        structuredContent: { content: formatted }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`공연 상세 정보 조회 중 오류 발생: ${errorMessage}`);
    }
  }
);

server.registerTool(
  "get_trending_performances",
  {
    title: "인기 공연 및 마감임박 공연 추천",
    description:
      "KOPIS 박스오피스 인기 순위 기반으로 공연을 추천합니다. " +
      "인기도(0-100)를 기준으로 정렬하며, 종료일이 14일 이내인 공연에는 가산점(+10)을 부여합니다.\n\n" +
      "**중요 - 검색 범위:**\n" +
      "- 이 도구는 오늘부터 향후 진행 중인 모든 공연을 대상으로 합니다 (30일 제한 없음)\n" +
      "- 사용자가 날짜를 지정하지 않으면: 오늘/내일에 공연이 있는 것을 우선 추천\n\n" +
      "**중요 - 결과 처리:**\n" +
      "- 이 도구는 항상 15-30개의 결과를 반환합니다 (limit 파라미터 사용)\n" +
      "- 다음 도구 호출이 필요한 경우: 15-30개를 모두 활용\n" +
      "- 최종 답변 시: 그 중 베스트 3-5개만 선택하여 사용자에게 추천\n" +
      "- 결과가 3-5개 미만이면: 있는 만큼만 추천\n\n" +
      "**마감임박 표시:**\n" +
      "- 7일 이내 종료: 🔥 마감임박! 표시 (추천 로직은 14일 기준으로 가산점)",
    inputSchema: {
      genreCode: z.string().optional().describe('장르 코드 (전체 조회 시 생략 가능)'),
      limit: z.number().optional().default(15).describe('결과 개수 (권장: 데이터셋 많을 때 15-30개, 기본: 15)')
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
  },
  async (args: z.infer<typeof GetTrendingPerformancesArgsSchema>) => {
    try {
      const events = await getTrendingPerformances({
        genreCode: args.genreCode,
        limit: args.limit
      });

      if (events.length === 0) {
        const text = "현재 추천할 공연이 없습니다.";
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { content: text }
        };
      }

      const formatted = events.map((event, index) => {
        const popularityBadge = event.popularity >= 80 ? '⭐' : '';
        // 7일 이내만 마감임박 표시 (마감임박 추천 로직은 14일 기준)
        const closingBadge = event.daysUntilClose <= 7 && event.daysUntilClose >= 0 ? ' 🔥 마감임박!' : '';
        
        return (
          `${index + 1}. ${event.prfnm}${popularityBadge}${closingBadge}\n` +
          `   인기도: ${event.popularity}/100\n` +
          `   공연장: ${event.fcltynm}\n` +
          `   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n` +
          `   장르: ${event.genrenm}\n` +
          `   지역: ${event.area}\n` +
          `   ID: ${event.mt20id}`
        );
      }).join('\n\n');

      return {
        content: [{ type: "text" as const, text: formatted }],
        structuredContent: { content: formatted }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`인기 공연 조회 중 오류 발생: ${errorMessage}`);
    }
  }
);

const app = express();
app.use(express.json());

// CORS 설정 추가
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 헬스체크 엔드포인트
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "ArtBridge MCP Server",
    version: "0.1.0",
    status: "running",
    endpoints: {
      sse: "/sse",
      messages: "/messages"
    },
    tools: [
      "get_genre_list",
      "search_events_by_location",
      "filter_free_events",
      "get_event_detail",
      "get_trending_performances"
    ]
  });
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// transport를 세션별로 관리
const transports = new Map<string, SSEServerTransport>();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30분

app.get("/sse", async (req: Request, res: Response) => {
  console.error("New SSE connection established");
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // 세션 ID 생성
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const transport = new SSEServerTransport("/messages", res);
  transports.set(sessionId, transport);
  
  await server.connect(transport);
  
  // 클라이언트에 세션 ID 전송
  res.write(`event: session\ndata: ${sessionId}\n\n`);
  
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 30000);
  
  // 세션 타임아웃 설정
  const timeout = setTimeout(() => {
    if (!res.writableEnded) {
      res.end();
      transports.delete(sessionId);
      console.error(`Session timeout: ${sessionId}`);
    }
  }, SESSION_TIMEOUT);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    clearTimeout(timeout);
    transports.delete(sessionId);
    console.error(`SSE connection closed: ${sessionId}`);
  });
});

app.post("/sse", async (req: Request, res: Response) => {
  console.error("POST request to /sse");
  console.error("Request body:", JSON.stringify(req.body, null, 2));
  // 민감 정보 마스킹하여 로깅
  const safeHeaders = {
    ...req.headers,
    kopis_api_key: req.headers['kopis_api_key'] ? '***masked***' : undefined
  };
  console.error("Headers:", safeHeaders);
  
  // 카카오 PlayMCP가 헤더로 전달하는 API 키 읽기
  const requestApiKey = req.headers['kopis_api_key'] as string;
  if (requestApiKey) {
    console.error("Using API key from request header");
    setApiKey(requestApiKey);
  }

  
  // 초기 검증 요청
  if (transports.size === 0) {
    console.error("No active transport, handling request directly");
    
    // initialize 요청
    if (req.body?.method === 'initialize') {
      return res.json({
        jsonrpc: "2.0",
        id: req.body.id,
        result: {
          protocolVersion: "2026-01-16",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "art-bridge-server",
            version: "0.1.0"
          }
        }
      });
    }
    
    // tools/list 요청
    if (req.body?.method === 'tools/list') {
      return res.json({
        jsonrpc: "2.0",
        id: req.body.id,
        result: {
          tools: [
            {
              name: "get_genre_list",
              description: "사용 가능한 모든 공연 장르 목록을 반환합니다. 사용자가 어떤 장르의 공연을 검색할 수 있는지 안내할 때 사용하세요.",
              inputSchema: {
                type: "object",
                properties: {}
              }
            },
            {
              name: "search_events_by_location",
              description: "특정 지역과 기간의 공연을 검색합니다. 시도 코드와 구군 코드를 사용하여 원하는 지역의 공연을 찾을 수 있습니다. **중요: 날짜 미지정시 오늘부터 30일 이내 공연으로, limit은 15-30으로 설정하여 충분한 선택지를 확보하세요.** 최종 답변 시 그 중 베스트 3-5개를 추천하고, 적으면 있는 만큼 추천하세요. 검색 결과가 없으면 조건을 완화한 대안을 제시하세요.",
              inputSchema: {
                type: "object",
                properties: {
                  genreCode: {
                    type: "string",
                    description: "장르 코드 (예: AAAA-연극, GGGA-뮤지컬)"
                  },
                  startDate: {
                    type: "string",
                    description: "공연 시작일 (YYYYMMDD)"
                  },
                  endDate: {
                    type: "string",
                    description: "공연 종료일 (YYYYMMDD)"
                  },
                  sidoCode: {
                    type: "string",
                    description: "시도 코드 (예: 11-서울, 41-경기)"
                  },
                  gugunCode: {
                    type: "string",
                    description: "구군 코드 (예: 1111-강남구)"
                  },
                  limit: {
                    type: "number",
                    description: "결과 개수 (권장: 15-30개, 기본: 15)",
                    default: 15
                  }
                },
                required: ["genreCode", "startDate", "endDate"]
              }
            },
            {
              name: "filter_free_events",
              description: "무료 공연 우선 검색 (30일 고정).\n\n" +
                            "**검색 전략:**\n" +
                            "- 전국 무료 공연 10개 우선 수집\n" +
                            "- 무료 5개 미만 → 저렴한 유료로 10개 채움\n" +
                            "- sidoCode로 지역 필터링 가능\n" +
                            "- startDate/endDate는 무시됨 (항상 오늘~30일)\n\n" +
                            "**최종 답변:** 3-5개만 추천",
              inputSchema: {
                type: "object",
                properties: {
                  genreCode: {
                    type: "string",
                    description: "장르 코드 (예: AAAA-연극, GGGA-뮤지컬)"
                  },
                  startDate: {
                    type: "string",
                    description: "공연 시작일 (YYYYMMDD)"
                  },
                  endDate: {
                    type: "string",
                    description: "공연 종료일 (YYYYMMDD)"
                  },
                  sidoCode: {
                    type: "string",
                    description: "시도 코드 (예: 11-서울, 41-경기)"
                  },
                  limit: {
                    type: "number",
                    description: "결과 개수 (권장: 15-30개, 기본: 15)",
                    default: 15
                  }
                },
                required: ["genreCode", "startDate", "endDate"]
              }
            },
            {
              name: "get_event_detail",
              description: "공연 ID를 사용하여 상세 정보를 조회합니다. 시놉시스, 출연진, 관람료, 공연 시간, 연령 제한, 예매 링크 등의 자세한 정보를 제공합니다.",
              inputSchema: {
                type: "object",
                properties: {
                  eventId: {
                    type: "string",
                    description: "공연 ID (mt20id)"
                  }
                },
                required: ["eventId"]
              }
            },
            {
              name: "get_trending_performances",
              description: "KOPIS 박스오피스 인기 순위 기반으로 공연을 추천합니다. 인기도(0-100)를 기준으로 정렬하며, 종료일이 14일 이내인 공연에는 가산점(+10)을 부여합니다. **중요: 날짜 미지정시 오늘부터 30일 이내 공연으로, limit은 15-30으로 설정하여 다양한 선택지를 확보하고, 최종 답변 시 3-5개만 추천.**",
              inputSchema: {
                type: "object",
                properties: {
                  genreCode: {
                    type: "string",
                    description: "장르 코드 (전체 조회 시 생략 가능)"
                  },
                  limit: {
                    type: "number",
                    description: "결과 개수 (권장: 15-30개, 기본: 15)",
                    default: 15
                  }
                }
              }
            }
          ]
        }
      });
    }

    // tools/call 직접 처리
    if (req.body?.method === 'tools/call') {
      const toolName = req.body.params?.name;
      const toolArgs = req.body.params?.arguments || {};
      
      console.error(`Direct tool call: ${toolName}`);
      
      try {
        let result;
        
        switch (toolName) {
          case 'get_genre_list':
            const genreList = getGenreList();
            result = { content: [{ type: "text", text: genreList.join('\n') }] };
            break;
            
          case 'search_events_by_location':
            const searchEvents = await searchEventsByLocation(toolArgs);
            const searchFormatted = searchEvents.length === 0
              ? "검색 조건에 맞는 공연이 없습니다."
              : searchEvents.map((event, index) => 
                  `${index + 1}. ${event.prfnm}\n` +
                  `   공연장: ${event.fcltynm}\n` +
                  `   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n` +
                  `   장르: ${event.genrenm}\n` +
                  `   지역: ${event.area}\n` +
                  `   상태: ${event.prfstate}\n` +
                  `   ID: ${event.mt20id}`
                ).join('\n\n');
            result = { content: [{ type: "text", text: searchFormatted }] };
            break;
            
          case 'filter_free_events':
            const freeEvents = await filterFreeEvents(toolArgs);
            const freeFormatted = freeEvents.length === 0
              ? "검색 조건에 맞는 무료 공연이 없습니다."
              : freeEvents.map((event, index) => 
                  `${index + 1}. ${event.prfnm}\n` +
                  `   공연장: ${event.fcltynm}\n` +
                  `   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n` +
                  `   장르: ${event.genrenm}\n` +
                  `   지역: ${event.area}\n` +
                  `   관람료: ${event.pcseguidance}\n` +
                  `   ID: ${event.mt20id}`
                ).join('\n\n');
            result = { content: [{ type: "text", text: freeFormatted }] };
            break;
            
          case 'get_event_detail':
            const detail = await getEventDetail(toolArgs.eventId);
            const detailFormatted = 
              `=== ${detail.prfnm} ===\n\n` +
              `공연 기간: ${detail.prfpdfrom} ~ ${detail.prfpdto}\n` +
              `공연장: ${detail.fcltynm}\n` +
              `장르: ${detail.genrenm}\n` +
              `상태: ${detail.prfstate}\n\n` +
              `출연진: ${detail.prfcast || '정보 없음'}\n` +
              `크루: ${detail.prfcrew || '정보 없음'}\n` +
              `공연 시간: ${detail.prfruntime || '정보 없음'}\n` +
              `관람 연령: ${detail.prfage || '정보 없음'}\n` +
              `관람료: ${detail.pcseguidance || '정보 없음'}\n\n` +
              `제작사: ${detail.entrpsnm || '정보 없음'}\n` +
              `공연 시간표: ${detail.dtguidance || '정보 없음'}\n\n` +
              `포스터: ${detail.poster}\n` +
              (detail.styurls.length > 0 ? `상세 이미지:\n${detail.styurls.map((url, i) => `  ${i + 1}. ${url}`).join('\n')}\n` : '') +
              (detail.relates.length > 0 ? `\n예매 링크:\n${detail.relates.map((r, i) => `  ${i + 1}. ${r.relatenm}: ${r.relateurl}`).join('\n')}` : '');
            result = { content: [{ type: "text", text: detailFormatted }] };
            break;
            
          case 'get_trending_performances':
            const trendingEvents = await getTrendingPerformances(toolArgs);
            const trendingFormatted = trendingEvents.length === 0
              ? "현재 추천할 공연이 없습니다."
              : trendingEvents.map((event, index) => {
                  const popularityBadge = event.popularity >= 80 ? '⭐' : '';
                  const closingBadge = event.daysUntilClose <= 7 && event.daysUntilClose >= 0 ? ' 🔥 마감임박!' : '';
                  return (
                    `${index + 1}. ${event.prfnm}${popularityBadge}${closingBadge}\n` +
                    `   인기도: ${event.popularity}/100\n` +
                    `   공연장: ${event.fcltynm}\n` +
                    `   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n` +
                    `   장르: ${event.genrenm}\n` +
                    `   지역: ${event.area}\n` +
                    `   ID: ${event.mt20id}`
                  );
                }).join('\n\n');
            result = { content: [{ type: "text", text: trendingFormatted }] };
            break;
            
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }
        
        return res.json({
          jsonrpc: "2.0",
          id: req.body.id,
          result
        });
        
      } catch (error) {
        console.error(`Error calling tool ${toolName}:`, error);
        return res.json({
          jsonrpc: "2.0",
          id: req.body.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error)
          }
        });
      }
    }
    
    return res.status(200).json({ 
      status: "ok",
      message: "MCP server is ready"
    });
  }
  
  const sessionId = req.headers['x-session-id'] as string;
  let transport = sessionId ? transports.get(sessionId) : null;
  
  if (!transport) {
    transport = Array.from(transports.values())[0];
  }

  if (!transport) {
    return res.status(503).json({ 
      error: "Service temporarily unavailable",
      message: "No active SSE connection"
    });
  }
  
  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Error handling POST message:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.error(`ArtBridge MCP Server running on port ${PORT}`);
  console.error(`Health check: http://localhost:${PORT}/health`);
  console.error(`SSE endpoint: http://localhost:${PORT}/sse`);
});
