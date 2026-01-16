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
  getDaysUntilClose,
} from './lib.js';

// Command line argument parsing
const defaultApiKey = process.env.KOPIS_API_KEY || process.argv[2] || '';

if (defaultApiKey) {
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

// Server setup
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

// Tool registrations (SDK의 tool handler는 직접 API 키를 받을 수 없으므로, 
// POST /sse에서 직접 처리하는 방식 사용)

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

// 나머지 tool들은 POST /sse에서 직접 처리 (API 키 필요)
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
    throw new Error("This tool requires API key and should be called via POST /sse");
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
    throw new Error("This tool requires API key and should be called via POST /sse");
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
    throw new Error("This tool requires API key and should be called via POST /sse");
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
    throw new Error("This tool requires API key and should be called via POST /sse");
  }
);

const app = express();
app.use(express.json());

// CORS 설정
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, kopis_api_key');
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
    protocolVersion: "2026-01-16",
    status: "running",
    endpoints: {
      sse: "/sse"
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

// SSE 연결 - Stateless
app.get("/sse", async (req: Request, res: Response) => {
  console.error("New SSE connection established");
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Stateless: 매 연결마다 새로운 transport 생성
  const transport = new SSEServerTransport("/sse", res);
  await server.connect(transport);
  
  // Keepalive
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    console.error("SSE connection closed");
  });
});

// POST 요청 처리 - Stateless + API 키 안전 처리
app.post("/sse", async (req: Request, res: Response) => {
  console.error("POST request to /sse");
  console.error("Request body:", JSON.stringify(req.body, null, 2));
  
  // API 키 가져오기 (헤더 우선, 없으면 환경변수)
  const requestApiKey = (req.headers['kopis_api_key'] as string) || defaultApiKey;
  
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
            description: "사용 가능한 모든 공연 장르 목록을 반환합니다.",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "search_events_by_location",
            description: "특정 지역과 기간의 공연을 검색합니다. 검색 결과가 없으면 자동으로 구/군 → 시/도 → 전국 순으로 범위를 확장합니다.",
            inputSchema: {
              type: "object",
              properties: {
                genreCode: { type: "string" },
                startDate: { type: "string" },
                endDate: { type: "string" },
                sidoCode: { type: "string" },
                gugunCode: { type: "string" },
                limit: { type: "number", default: 15 }
              },
              required: ["genreCode", "startDate", "endDate"]
            }
          },
          {
            name: "filter_free_events",
            description: "무료 공연만 필터링하여 검색합니다. 무료 공연이 부족하면 저렴한 유료 공연으로 채워 반환합니다.",
            inputSchema: {
              type: "object",
              properties: {
                genreCode: { type: "string" },
                startDate: { type: "string" },
                endDate: { type: "string" },
                sidoCode: { type: "string" },
                limit: { type: "number", default: 5 }
              },
              required: ["genreCode", "startDate", "endDate"]
            }
          },
          {
            name: "get_event_detail",
            description: "공연 ID를 사용하여 상세 정보를 조회합니다.",
            inputSchema: {
              type: "object",
              properties: {
                eventId: { type: "string" }
              },
              required: ["eventId"]
            }
          },
          {
            name: "get_trending_performances",
            description: "KOPIS 박스오피스 인기 순위 기반으로 공연을 추천합니다. 검색 결과가 없으면 전체 장르로 확장하여 추천합니다.",
            inputSchema: {
              type: "object",
              properties: {
                genreCode: { type: "string" },
                limit: { type: "number", default: 15 }
              }
            }
          }
        ]
      }
    });
  }

  // tools/call 직접 처리 - API 키를 각 함수에 전달
  if (req.body?.method === 'tools/call') {
    const toolName = req.body.params?.name;
    const toolArgs = req.body.params?.arguments || {};
    
    // API 키 확인
    if (!requestApiKey && toolName !== 'get_genre_list') {
      return res.json({
        jsonrpc: "2.0",
        id: req.body.id,
        error: {
          code: -32001,
          message: "API key is required. Please provide KOPIS_API_KEY in header or environment variable."
        }
      });
    }
    
    console.error(`Direct tool call: ${toolName}`);
    
    try {
      let result;
      
      switch (toolName) {
        case 'get_genre_list':
          const genreList = getGenreList();
          result = { content: [{ type: "text", text: genreList.join('\n') }] };
          break;
          
        case 'search_events_by_location':
          let searchEvents = await searchEventsByLocation(toolArgs, requestApiKey);
          let searchMessage = '';
          
          // 결과가 없으면 범위 확장
          if (searchEvents.length === 0) {
            // 1단계: 구군 코드 제거 (시도만)
            if (toolArgs.gugunCode && toolArgs.sidoCode) {
              console.error(`No results found. Expanding search: removing gugunCode`);
              searchMessage = '🔍 해당 구/군에서 검색 결과가 없어 시/도 전체로 확장했습니다.\n\n';
              const expandedArgs = { ...toolArgs, gugunCode: undefined };
              searchEvents = await searchEventsByLocation(expandedArgs, requestApiKey);
            }
            
            // 2단계: 시도 코드도 제거 (전국)
            if (searchEvents.length === 0 && toolArgs.sidoCode) {
              console.error(`Still no results. Expanding search: removing sidoCode`);
              searchMessage = '🔍 해당 지역에서 검색 결과가 없어 전국으로 확장했습니다.\n\n';
              const expandedArgs = { ...toolArgs, sidoCode: undefined, gugunCode: undefined };
              searchEvents = await searchEventsByLocation(expandedArgs, requestApiKey);
            }
            
            // 3단계: limit 증가
            if (searchEvents.length === 0) {
              console.error(`Still no results. Expanding search: increasing limit`);
              const expandedArgs = { ...toolArgs, sidoCode: undefined, gugunCode: undefined, limit: 50 };
              searchEvents = await searchEventsByLocation(expandedArgs, requestApiKey);
            }
          }
          
          const searchFormatted = searchEvents.length === 0
            ? "검색 조건에 맞는 공연이 없습니다. 날짜 범위를 넓혀보시거나 다른 장르를 검색해보세요."
            : searchMessage + searchEvents.map((event, index) => 
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
          const freeEvents = await filterFreeEvents(toolArgs, requestApiKey);
          const freeFormatted = freeEvents.length === 0
            ? "검색 조건에 맞는 무료 공연이 없습니다."
            : freeEvents.map((event, index) => {
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
          result = { content: [{ type: "text", text: freeFormatted }] };
          break;
          
        case 'get_event_detail':
          const detail = await getEventDetail(toolArgs.eventId, requestApiKey);
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
          let trendingEvents = await getTrendingPerformances(toolArgs, requestApiKey);
          let trendingMessage = '';
          
          // 결과가 없으면 범위 확장
          if (trendingEvents.length === 0) {
            // 1단계: 장르 제거 (전체 장르)
            if (toolArgs.genreCode) {
              console.error(`No trending results. Expanding: removing genreCode`);
              trendingMessage = '🔍 해당 장르의 인기 공연이 없어 전체 장르로 확장했습니다.\n\n';
              const expandedArgs = { ...toolArgs, genreCode: undefined };
              trendingEvents = await getTrendingPerformances(expandedArgs, requestApiKey);
            }
            
            // 2단계: limit 증가
            if (trendingEvents.length === 0) {
              console.error(`Still no trending results. Expanding: increasing limit`);
              const expandedArgs = { ...toolArgs, genreCode: undefined, limit: 100 };
              trendingEvents = await getTrendingPerformances(expandedArgs, requestApiKey);
            }
          }
          
          const trendingFormatted = trendingEvents.length === 0
            ? "현재 추천할 공연이 없습니다. 다른 날짜나 장르를 검색해보세요."
            : trendingMessage + trendingEvents.map((event, index) => {
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.error(`ArtBridge MCP Server running on port ${PORT}`);
  console.error(`Protocol Version: 2026-01-16`);
  console.error(`Health check: http://localhost:${PORT}/health`);
  console.error(`SSE endpoint: http://localhost:${PORT}/sse`);
});