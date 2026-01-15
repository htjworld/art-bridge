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
} from './lib.js';

// Command line argument parsing
const apiKey = process.env.KOPIS_API_KEY || process.argv[2];

if (!apiKey) {
  console.error("Error: KOPIS_API_KEY is required via environment variable or argument.");
  process.exit(1);
}

setApiKey(apiKey);
console.error("Art-Bridge MCP Server initializing...");

// Schema definitions
const GetGenreListArgsSchema = z.object({});

const SearchEventsByLocationArgsSchema = z.object({
  genreCode: z.string().describe('장르 코드 (예: AAAA-연극, GGGA-뮤지컬)'),
  startDate: z.string().describe('공연 시작일 (YYYYMMDD)'),
  endDate: z.string().describe('공연 종료일 (YYYYMMDD)'),
  sidoCode: z.string().optional().describe('시도 코드 (예: 11-서울, 41-경기)'),
  gugunCode: z.string().optional().describe('구군 코드 (예: 1111-강남구)'),
  limit: z.number().optional().default(5).describe('결과 개수 (기본: 5)')
});

const FilterFreeEventsArgsSchema = z.object({
  genreCode: z.string().describe('장르 코드 (예: AAAA-연극, GGGA-뮤지컬)'),
  startDate: z.string().describe('공연 시작일 (YYYYMMDD)'),
  endDate: z.string().describe('공연 종료일 (YYYYMMDD)'),
  sidoCode: z.string().optional().describe('시도 코드 (예: 11-서울, 41-경기)'),
  limit: z.number().optional().default(5).describe('결과 개수 (기본: 5)')
});

const GetEventDetailArgsSchema = z.object({
  eventId: z.string().describe('공연 ID (mt20id)')
});

const GetTrendingPerformancesArgsSchema = z.object({
  genreCode: z.string().optional().describe('장르 코드 (전체 조회 시 생략 가능)'),
  limit: z.number().optional().default(5).describe('결과 개수 (기본: 5)')
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
      "사용 가능한 모든 공연 장르 목록을 반환합니다. " +
      "사용자가 어떤 장르의 공연을 검색할 수 있는지 안내할 때 사용하세요.",
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
      "기본적으로 5개의 결과를 반환하며, limit 파라미터로 조정 가능합니다.",
    inputSchema: {
      genreCode: z.string().describe('장르 코드 (예: AAAA-연극, GGGA-뮤지컬)'),
      startDate: z.string().describe('공연 시작일 (YYYYMMDD)'),
      endDate: z.string().describe('공연 종료일 (YYYYMMDD)'),
      sidoCode: z.string().optional().describe('시도 코드 (예: 11-서울, 41-경기)'),
      gugunCode: z.string().optional().describe('구군 코드 (예: 1111-강남구)'),
      limit: z.number().optional().default(5).describe('결과 개수 (기본: 5)')
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
      "공연 목록을 가져온 후 각 공연의 상세 정보를 확인하여 무료 공연만 반환합니다. " +
      "기본적으로 5개의 결과를 반환하며, limit 파라미터로 조정 가능합니다.",
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

      const formatted = events.map((event, index) => 
        `${index + 1}. ${event.prfnm}\n` +
        `   공연장: ${event.fcltynm}\n` +
        `   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n` +
        `   장르: ${event.genrenm}\n` +
        `   지역: ${event.area}\n` +
        `   관람료: ${event.pcseguidance}\n` +
        `   ID: ${event.mt20id}`
      ).join('\n\n');

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
      "인기도(0-100)를 기준으로 정렬하며, 종료일이 14일 이내인 공연에는 가산점(+10)을 부여합니다. " +
      "기본적으로 5개의 결과를 반환하며, limit 파라미터로 조정 가능합니다.",
    inputSchema: {
      genreCode: z.string().optional().describe('장르 코드 (전체 조회 시 생략 가능)'),
      limit: z.number().optional().default(5).describe('결과 개수 (기본: 5)')
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
        const popularityBadge = event.popularity >= 80 ? '🔥' : event.popularity >= 60 ? '⭐' : '';
        const closingBadge = event.isClosingSoon ? ' ⏰ 마감임박!' : '';
        
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
  console.error("Headers:", req.headers);
  
  // 초기 검증 요청
  if (transports.size === 0) {
    console.error("No active transport, handling request directly");
    
    // initialize 요청
    if (req.body?.method === 'initialize') {
      return res.json({
        jsonrpc: "2.0",
        id: req.body.id,
        result: {
          protocolVersion: "2024-11-05",
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
              description: "특정 지역과 기간의 공연을 검색합니다. 시도 코드와 구군 코드를 사용하여 원하는 지역의 공연을 찾을 수 있습니다. 기본적으로 5개의 결과를 반환하며, limit 파라미터로 조정 가능합니다.",
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
                    description: "결과 개수 (기본: 5)",
                    default: 5
                  }
                },
                required: ["genreCode", "startDate", "endDate"]
              }
            },
            {
              name: "filter_free_events",
              description: "무료 공연만 필터링하여 검색합니다. 공연 목록을 가져온 후 각 공연의 상세 정보를 확인하여 무료 공연만 반환합니다. 기본적으로 5개의 결과를 반환하며, limit 파라미터로 조정 가능합니다.",
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
                    description: "결과 개수 (기본: 5)",
                    default: 5
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
              description: "KOPIS 박스오피스 인기 순위 기반으로 공연을 추천합니다. 인기도(0-100)를 기준으로 정렬하며, 종료일이 14일 이내인 공연에는 가산점(+10)을 부여합니다. 기본적으로 5개의 결과를 반환하며, limit 파라미터로 조정 가능합니다.",
              inputSchema: {
                type: "object",
                properties: {
                  genreCode: {
                    type: "string",
                    description: "장르 코드 (전체 조회 시 생략 가능)"
                  },
                  limit: {
                    type: "number",
                    description: "결과 개수 (기본: 5)",
                    default: 5
                  }
                }
              }
            }
          ]
        }
      });
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
