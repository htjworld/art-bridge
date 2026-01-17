#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import {
  GENRE_CODES,
  getGenreList,
  searchEventsByLocation,
  filterFreeEvents,
  getEventDetail,
  getTrendingPerformances,
  getDaysUntilClose,
} from './lib.js';

// API 키 처리
const defaultApiKey = process.env.KOPIS_API_KEY || '';

if (defaultApiKey) {
  console.error("Art-Bridge MCP Server initializing with API key from environment");
} else {
  console.error("Art-Bridge MCP Server initializing (API key required via kopis_api_key header)");
}

// MCP Server 초기화
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

// Tool 등록
server.registerTool(
  "get_genre_list",
  {
    title: "장르 목록 조회",
    description: "사용자가 장르를 특정하지 않았을 때, 선택 가능한 모든 공연 장르 목록을 보여주는 도구입니다. 사용자에게 1-9번 번호와 장르명을 표시하여 선택하도록 안내하세요. 사용자가 번호나 장르명으로 응답하면, 해당하는 장르 코드(예: 1번 또는 '연극' → AAAA)를 사용하여 검색하세요.",
    inputSchema: {},
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
  },
  async (args) => {
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
    description: "특정 지역과 기간의 공연을 검색합니다. **중요: limit은 20으로 설정하여 충분한 선택지를 확보하세요.** 검색 결과가 많으면 그 중 베스트 5개를 추천하고, 적으면 있는 만큼 추천하세요. 검색 결과가 없으면 조건을 완화한 대안을 제시하세요.",
    inputSchema: {
      genreCode: z.string().describe('장르 코드 (예: AAAA-연극, GGGA-뮤지컬)'),
      startDate: z.string().describe('공연 시작일 (YYYYMMDD)'),
      endDate: z.string().describe('공연 종료일 (YYYYMMDD)'),
      sidoCode: z.string().optional().describe('시도 코드 (예: 11-서울, 41-경기)'),
      gugunCode: z.string().optional().describe('구군 코드 (예: 1111-강남구)'),
      limit: z.number().optional().default(20).describe('결과 개수 (기본: 20)')
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
  },
  async (args) => {
    throw new Error("This tool requires API key and should be called via POST /sse");
  }
);

server.registerTool(
  "filter_free_events",
  {
    title: "무료 공연 검색",
    description: "무료 공연만 필터링하여 검색합니다. **중요: limit은 20으로 설정.** 최종 답변 시: 그 중 베스트 5개만 추천. 결과가 5개 미만이면: 있는 만큼만 추천. 결과가 없으면: 유료 공연 중 저렴한 것을 대안으로 제시",
    inputSchema: {
      genreCode: z.string().describe('장르 코드 (예: AAAA-연극, GGGA-뮤지컬)'),
      startDate: z.string().describe('공연 시작일 (YYYYMMDD)'),
      endDate: z.string().describe('공연 종료일 (YYYYMMDD)'),
      sidoCode: z.string().optional().describe('시도 코드 (예: 11-서울, 41-경기)'),
      limit: z.number().optional().default(20).describe('결과 개수 (기본: 20)')
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
  },
  async (args) => {
    throw new Error("This tool requires API key and should be called via POST /sse");
  }
);

server.registerTool(
  "get_event_detail",
  {
    title: "공연 상세 정보 조회",
    description: "공연 ID를 사용하여 상세 정보를 조회합니다. 시놉시스, 출연진, 관람료, 공연 시간, 연령 제한 등의 자세한 정보를 제공합니다.",
    inputSchema: {
      eventId: z.string().describe('공연 ID (mt20id)')
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
  },
  async (args) => {
    throw new Error("This tool requires API key and should be called via POST /sse");
  }
);

server.registerTool(
  "get_trending_performances",
  {
    title: "인기 공연 및 마감임박 공연 추천",
    description: "KOPIS 박스오피스 인기 순위 기반으로 공연을 추천합니다. **중요: limit은 20으로 설정.** 최종 답변 시: 그 중 베스트 5개만 추천. 결과가 5개 미만이면: 있는 만큼만 추천. 7일 이내 종료 공연에는 🔥 마감임박! 표시",
    inputSchema: {
      genreCode: z.string().optional().describe('장르 코드 (전체 조회 시 생략 가능)'),
      limit: z.number().optional().default(20).describe('결과 개수 (기본: 20)')
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
  },
  async (args) => {
    throw new Error("This tool requires API key and should be called via POST /sse");
  }
);

const app = express();
app.use(express.json());

// CORS 설정
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, kopis_api_key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 헬스체크
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "ArtBridge MCP Server",
    version: "0.1.0",
    protocolVersion: "2026-01-17",
    status: "running",
    transport: "streamable-http",
    endpoints: {
      mcp: "/sse"
    }
  });
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ 
    status: "ok",
    protocolVersion: "2026-01-17",
    transport: "streamable-http"
  });
});

// 세션 저장소 (메모리)
const sessions = new Map<string, { transport: SSEServerTransport }>();

// 단일 MCP 엔드포인트: GET /sse (SSE 스트림 열기)
app.get("/sse", async (req: Request, res: Response) => {
  console.error("GET /sse - Opening SSE stream");
  
  // Accept 헤더 확인
  const acceptHeader = req.headers.accept || '';
  if (!acceptHeader.includes('text/event-stream')) {
    return res.status(406).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Not Acceptable. Accept header must include text/event-stream"
      }
    });
  }

  // 세션 ID 확인
  const sessionId = req.headers['mcp-session-id'] as string;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  if (sessionId) {
    res.setHeader('Mcp-Session-Id', sessionId);
  }

  const transport = new SSEServerTransport("/sse", res);
  
  if (sessionId && !sessions.has(sessionId)) {
    sessions.set(sessionId, { transport });
  }
  
  await server.connect(transport);

  const keepAlive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    if (sessionId) {
      sessions.delete(sessionId);
    }
    console.error("SSE connection closed");
  });
});

// 단일 MCP 엔드포인트: POST /sse (메시지 전송)
app.post("/sse", async (req: Request, res: Response) => {
  console.error("POST /sse - Received message");
  
  // Accept 헤더 확인
  const acceptHeader = req.headers.accept || '';
  if (!acceptHeader.includes('application/json') && !acceptHeader.includes('text/event-stream')) {
    return res.status(406).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Not Acceptable. Accept header must include application/json or text/event-stream"
      }
    });
  }

  // Content-Type 확인
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Unsupported Media Type. Content-Type must be application/json"
      }
    });
  }

  const requestApiKey = (req.headers['kopis_api_key'] as string) || defaultApiKey;
  const sessionId = req.headers['mcp-session-id'] as string;

  // initialize 요청 처리
  if (req.body?.method === 'initialize') {
    const newSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const response = {
      jsonrpc: "2.0",
      id: req.body.id,
      result: {
        protocolVersion: "2026-01-17",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "art-bridge-server",
          version: "0.1.0"
        }
      }
    };

    res.setHeader('Mcp-Session-Id', newSessionId);
    return res.json(response);
  }

  // tools/list 요청
  if (req.body?.method === 'tools/list') {
    if (sessionId) {
      res.setHeader('Mcp-Session-Id', sessionId);
    }
    
    return res.json({
      jsonrpc: "2.0",
      id: req.body.id,
      result: {
        tools: [
          {
            name: "get_genre_list",
            description: "사용 가능한 모든 공연 장르 목록을 반환합니다.",
            inputSchema: { type: "object", properties: {} }
          },
          {
            name: "search_events_by_location",
            description: "특정 지역과 기간의 공연을 검색합니다.",
            inputSchema: {
              type: "object",
              properties: {
                genreCode: { type: "string" },
                startDate: { type: "string" },
                endDate: { type: "string" },
                sidoCode: { type: "string" },
                gugunCode: { type: "string" },
                limit: { type: "number", default: 20 }
              },
              required: ["genreCode", "startDate", "endDate"]
            }
          },
          {
            name: "filter_free_events",
            description: "무료 공연만 필터링하여 검색합니다.",
            inputSchema: {
              type: "object",
              properties: {
                genreCode: { type: "string" },
                startDate: { type: "string" },
                endDate: { type: "string" },
                sidoCode: { type: "string" },
                limit: { type: "number", default: 20 }
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
            description: "KOPIS 박스오피스 인기 순위 기반으로 공연을 추천합니다.",
            inputSchema: {
              type: "object",
              properties: {
                genreCode: { type: "string" },
                limit: { type: "number", default: 20 }
              }
            }
          }
        ]
      }
    });
  }

  // notifications/initialized 처리
  if (req.body?.method === 'notifications/initialized') {
    if (sessionId) {
      res.setHeader('Mcp-Session-Id', sessionId);
    }
    return res.status(202).send();
  }

  // tools/call 처리
  if (req.body?.method === 'tools/call') {
    if (sessionId) {
      res.setHeader('Mcp-Session-Id', sessionId);
    }

    const toolName = req.body.params?.name;
    const toolArgs = req.body.params?.arguments || {};

    if (!requestApiKey && toolName !== 'get_genre_list') {
      return res.json({
        jsonrpc: "2.0",
        id: req.body.id,
        error: {
          code: -32001,
          message: "API key is required. Please provide KOPIS_API_KEY in kopis_api_key header or environment variable."
        }
      });
    }

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

          if (searchEvents.length < 3) {
            if (toolArgs.gugunCode) {
              searchMessage = '🔍 해당 구/군에 공연이 없어 범위를 넓혀 검색합니다.\n\n';
              const expandedArgs = { ...toolArgs, gugunCode: undefined };
              searchEvents = await searchEventsByLocation(expandedArgs, requestApiKey);
            }

            if (searchEvents.length < 3 && toolArgs.sidoCode) {
              searchMessage = '🔍 해당 지역에 공연이 없어 전국 단위로 검색합니다.\n\n'
              const expandedArgs = { ...toolArgs, sidoCode: undefined, gugunCode: undefined };
              searchEvents = await searchEventsByLocation(expandedArgs, requestApiKey);
            }
          }

          const searchFormatted = searchEvents.length === 0
            ? "검색 조건에 맞는 공연이 없습니다."
            : searchMessage + searchEvents.map((event, index) =>
              `${index + 1}. ${event.prfnm}\n   공연장: ${event.fcltynm}\n   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n   장르: ${event.genrenm}\n   지역: ${event.area}\n   상태: ${event.prfstate}\n   ID: ${event.mt20id}`
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
              return `${index + 1}. ${event.prfnm}${closingBadge}\n   공연장: ${event.fcltynm}\n   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n   장르: ${event.genrenm}\n   지역: ${event.area}\n   관람료: ${event.pcseguidance}\n   ID: ${event.mt20id}`;
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

          if (trendingEvents.length === 0 && toolArgs.genreCode) {
            trendingMessage = '🔍 해당 장르의 인기 공연이 없어 전체 장르로 확장했습니다.\n\n';
            const expandedArgs = { ...toolArgs, genreCode: undefined };
            trendingEvents = await getTrendingPerformances(expandedArgs, requestApiKey);
          }

          const trendingFormatted = trendingEvents.length === 0
            ? "현재 추천할 공연이 없습니다."
            : trendingMessage + trendingEvents.map((event, index) => {
              const popularityBadge = event.popularity >= 80 ? '⭐' : '';
              const closingBadge = event.daysUntilClose <= 7 && event.daysUntilClose >= 0 ? ' 🔥 마감임박!' : '';
              return `${index + 1}. ${event.prfnm}${popularityBadge}${closingBadge}\n   인기도: ${event.popularity}/100\n   공연장: ${event.fcltynm}\n   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n   장르: ${event.genrenm}\n   지역: ${event.area}\n   ID: ${event.mt20id}`;
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

  // 기타 notifications/responses
  if (!req.body?.id) {
    if (sessionId) {
      res.setHeader('Mcp-Session-Id', sessionId);
    }
    return res.status(202).send();
  }

  return res.status(400).json({
    jsonrpc: "2.0",
    error: {
      code: -32600,
      message: "Invalid Request"
    }
  });
});

// DELETE: 세션 종료
app.delete("/sse", (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
    return res.status(200).json({ message: "Session terminated" });
  }
  
  return res.status(404).json({ error: "Session not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.error(`ArtBridge MCP Server running on port ${PORT}`);
  console.error(`Protocol Version: 2026-01-17`);
  console.error(`Transport: Streamable HTTP`);
  console.error(`Health check: http://localhost:${PORT}/health`);
  console.error(`MCP endpoint: http://localhost:${PORT}/sse`);
});