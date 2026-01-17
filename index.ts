#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import {
  getGenreList,
  searchEventsByLocation,
  filterFreeEvents,
  getEventDetail,
  getTrendingPerformances,
  getDaysUntilClose,
} from './lib.js';

const defaultApiKey = process.env.KOPIS_API_KEY || '';

if (defaultApiKey) {
  console.error("Art-Bridge MCP Server initializing with API key from environment");
} else {
  console.error("Art-Bridge MCP Server initializing (API key required via kopis_api_key header)");
}

const app = express();
app.use(express.json());

// CORS 설정
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, kopis_api_key, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
  
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
    status: "running",
    transport: "streamable-http",
    protocol_version: "2025-03-26",
    endpoint: "/mcp"
  });
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// MCP 서버 생성 함수
function createMCPServer(apiKey: string) {
  const server = new McpServer(
    { name: "art-bridge-server", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.registerTool(
    "get_genre_list",
    {
      title: "장르 목록 조회",
      description: "사용자가 장르를 특정하지 않았을 때, 선택 가능한 모든 공연 장르 목록을 보여주는 도구입니다. 사용자에게 1-9번 번호와 장르명을 표시하여 선택하도록 안내하세요. 사용자가 번호나 장르명으로 응답하면, 해당하는 장르 코드(예: 1번 또는 '연극' → AAAA)를 사용하여 검색하세요.",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    },
    async () => {
      try {
        const text = getGenreList().join('\n');
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
          }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "search_events_by_location",
    {
      title: "지역별 공연 검색",
      description: "특정 지역과 기간의 공연을 검색합니다. 시도 코드와 구군 코드를 사용하여 원하는 지역의 공연을 찾을 수 있습니다. **중요: limit은 20으로 설정하여 충분한 선택지를 확보하세요.** 검색 결과가 많으면 그 중 베스트 5개를 추천하고, 적으면 있는 만큼 추천하세요. 검색 결과가 없으면 조건을 완화한 대안을 제시하세요.",
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
            description: "결과 개수 (기본: 20)",
            default: 20
          }
        },
        required: ["genreCode", "startDate", "endDate"]
      }
    },
    async (args: any) => {
      try {
        let events = await searchEventsByLocation(args, apiKey);
        let message = '';

        if (events.length < 3 && args.gugunCode) {
          message = '🔍 해당 구/군에 공연이 없어 범위를 넓혀 검색합니다.\n\n';
          events = await searchEventsByLocation({ ...args, gugunCode: undefined }, apiKey);
        }

        if (events.length < 3 && args.sidoCode) {
          message = '🔍 해당 지역에 공연이 없어 전국 단위로 검색합니다.\n\n';
          events = await searchEventsByLocation({ ...args, sidoCode: undefined, gugunCode: undefined }, apiKey);
        }

        const text = events.length === 0 
          ? "검색 조건에 맞는 공연이 없습니다."
          : message + events.map((e, i) =>
            `${i + 1}. ${e.prfnm}\n   공연장: ${e.fcltynm}\n   기간: ${e.prfpdfrom} ~ ${e.prfpdto}\n   장르: ${e.genrenm}\n   지역: ${e.area}\n   상태: ${e.prfstate}\n   ID: ${e.mt20id}`
          ).join('\n\n');
        
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
          }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "filter_free_events",
    {
      title: "무료 공연 검색",
      description: "무료 공연만 필터링하여 검색합니다. 공연 목록을 가져온 후 각 공연의 상세 정보를 확인하여 무료 공연만 반환합니다.\n\n**중요 - 날짜 설정:**\n- 사용자가 날짜를 지정하지 않으면: 오늘부터 30일 이내 공연 중 오늘/내일에 공연이 있는 것을 우선 추천\n- 사용자가 '오늘', '내일', '이번주', '다음주' 등을 지정하면: 해당 기간에 맞춰 startDate/endDate 계산\n\n**중요 - 결과 처리:**\n- 이 도구는 항상 20개의 결과를 반환합니다 (limit 파라미터 사용)\n- 최종 답변 시: 그 중 베스트 5개만 선택하여 사용자에게 추천\n- 결과가 5개 미만이면: 있는 만큼만 추천\n- 결과가 없으면: 유료 공연 중 저렴한 것을 대안으로 제시",
      inputSchema: {
        type: "object",
        properties: {
          genreCode: {
            type: "string",
            description: "장르 코드 (예: AAAA-연극, GGGA-뮤지컬)"
          },
          sidoCode: {
            type: "string",
            description: "시도 코드 (예: 11-서울, 41-경기)"
          },
          limit: {
            type: "number",
            description: "결과 개수 (기본: 20)",
            default: 20
          }
        },
        required: ["genreCode"]
      }
    },
    async (args: any) => {
      try {
        const events = await filterFreeEvents(args, apiKey);
        
        const text = events.length === 0
          ? "검색 조건에 맞는 무료 공연이 없습니다."
          : events.map((e, i) => {
            const days = getDaysUntilClose(e.prfpdto);
            const badge = days <= 7 && days >= 0 ? ' 🔥 마감임박!' : '';
            return `${i + 1}. ${e.prfnm}${badge}\n   공연장: ${e.fcltynm}\n   기간: ${e.prfpdfrom} ~ ${e.prfpdto}\n   장르: ${e.genrenm}\n   지역: ${e.area}\n   관람료: ${e.pcseguidance}\n   ID: ${e.mt20id}`;
          }).join('\n\n');
        
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
          }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "get_event_detail",
    {
      title: "공연 상세 정보 조회",
      description: "공연 ID를 사용하여 상세 정보를 조회합니다. 시놉시스, 출연진, 관람료, 공연 시간, 연령 제한 등의 자세한 정보를 제공합니다.",
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
    async (args: any) => {
      try {
        const d = await getEventDetail(args.eventId, apiKey);
        
        const text = 
          `=== ${d.prfnm} ===\n\n` +
          `공연 기간: ${d.prfpdfrom} ~ ${d.prfpdto}\n공연장: ${d.fcltynm}\n장르: ${d.genrenm}\n상태: ${d.prfstate}\n\n` +
          `출연진: ${d.prfcast || '정보 없음'}\n크루: ${d.prfcrew || '정보 없음'}\n공연 시간: ${d.prfruntime || '정보 없음'}\n` +
          `관람 연령: ${d.prfage || '정보 없음'}\n관람료: ${d.pcseguidance || '정보 없음'}\n\n` +
          `제작사: ${d.entrpsnm || '정보 없음'}\n공연 시간표: ${d.dtguidance || '정보 없음'}\n\n포스터: ${d.poster}\n` +
          (d.styurls.length > 0 ? `상세 이미지:\n${d.styurls.map((u, i) => `  ${i + 1}. ${u}`).join('\n')}\n` : '') +
          (d.relates.length > 0 ? `\n예매 링크:\n${d.relates.map((r, i) => `  ${i + 1}. ${r.relatenm}: ${r.relateurl}`).join('\n')}` : '');
        
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
          }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "get_trending_performances",
    {
      title: "인기 공연 추천",
      description: "KOPIS 박스오피스 인기 순위 기반으로 공연을 추천합니다. 인기도(0-100)를 기준으로 정렬하며, 종료일이 14일 이내인 공연에는 가산점(+10)을 부여합니다.\n\n**중요 - 검색 범위:**\n- 이 도구는 오늘부터 향후 진행 중인 모든 공연을 대상으로 합니다 (30일 제한 없음)\n- 사용자가 날짜를 지정하지 않으면: 오늘/내일에 공연이 있는 것을 우선 추천\n\n**중요 - 결과 처리:**\n- 이 도구는 항상 20개의 결과를 반환합니다 (limit 파라미터 사용)\n- 다음 도구 호출이 필요한 경우: 20개를 모두 활용\n- 최종 답변 시: 그 중 베스트 5개만 선택하여 사용자에게 추천\n- 결과가 5개 미만이면: 있는 만큼만 추천\n\n**마감임박 표시:**\n- 7일 이내 종료: 🔥 마감임박! 표시 (추천 로직은 14일 기준으로 가산점)",
      inputSchema: {
        type: "object",
        properties: {
          genreCode: {
            type: "string",
            description: "장르 코드 (전체 조회 시 생략 가능)"
          },
          limit: {
            type: "number",
            description: "결과 개수 (기본: 20)",
            default: 20
          }
        },
        required: []
      }
    },
    async (args: any) => {
      try {
        let events = await getTrendingPerformances(args, apiKey);
        let message = '';

        if (events.length === 0 && args.genreCode) {
          message = '🔍 해당 장르의 인기 공연이 없어 전체 장르로 확장했습니다.\n\n';
          events = await getTrendingPerformances({ ...args, genreCode: undefined }, apiKey);
        }

        const text = events.length === 0
          ? "현재 추천할 공연이 없습니다."
          : message + events.map((e, i) => {
            const popular = e.popularity >= 80 ? '⭐' : '';
            const closing = e.daysUntilClose <= 7 && e.daysUntilClose >= 0 ? ' 🔥 마감임박!' : '';
            return `${i + 1}. ${e.prfnm}${popular}${closing}\n   인기도: ${e.popularity}/100\n   공연장: ${e.fcltynm}\n   기간: ${e.prfpdfrom} ~ ${e.prfpdto}\n   장르: ${e.genrenm}\n   지역: ${e.area}\n   ID: ${e.mt20id}`;
          }).join('\n\n');
        
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
          }],
          isError: true
        };
      }
    }
  );

  return server;
}

// Streamable HTTP 엔드포인트 (Stateless 모드)
async function handleMcpRequest(req: Request, res: Response) {
  console.error(`${req.method} /mcp - MCP request`);
  
  // API 키 가져오기
  const apiKey = (req.headers['kopis_api_key'] as string) || defaultApiKey;
  
  if (!apiKey) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "API key required. Please provide kopis_api_key header."
      },
      id: null
    });
  }
  
  try {
    // Stateless 모드: 각 요청마다 새로운 서버와 트랜스포트 생성
    const server = createMCPServer(apiKey);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,  // Stateless
    });
    
    // 서버-트랜스포트 연결
    await server.connect(transport);
    
    // 요청 처리 - handle 메서드 사용
    await transport.handle(req, res);
    
    console.error('MCP request completed');
  } catch (error) {
    console.error("MCP request handling error:", error);
    
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error"
        },
        id: null
      });
    }
  }
}

// MCP 엔드포인트 등록 (POST, GET, DELETE)
app.post("/mcp", handleMcpRequest);
app.get("/mcp", handleMcpRequest);
app.delete("/mcp", (req: Request, res: Response) => {
  // Stateless이므로 세션 종료는 단순히 200 OK 반환
  console.error('DELETE /mcp - Session termination (stateless mode)');
  res.status(200).json({
    jsonrpc: "2.0",
    result: { success: true },
    id: null
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.error(`ArtBridge MCP Server running on port ${PORT}`);
  console.error(`MCP Endpoint: http://localhost:${PORT}/mcp`);
  console.error(`Protocol: Streamable HTTP (2025-03-26)`);
  console.error(`Mode: Stateless`);
});