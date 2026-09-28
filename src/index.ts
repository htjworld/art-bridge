import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { KopisService } from './services/kopis.service.js';
import { SmartSearchService } from './services/smart-search.service.js';
import { config } from './config/index.js';
import { GENRE_EXAMPLES, SIDO_EXAMPLES, GUGUN_EXAMPLES } from './constants/kopis-codes.js';
import { isFreeEvent } from './utils/event-helpers.js';

const app = express();

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    serverType: 'stateless-smart-search',
    transport: 'streamableHttp',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// MCP Server configuration
const server = new Server(
  {
    name: 'art-bridge-mcp-server',
    version: '2.0.0', // 스마트 검색 버전
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
const tools: Tool[] = [
  {
    name: 'get_genre_list',
    description: '사용 가능한 모든 공연 장르 코드와 이름을 조회합니다. 연극, 뮤지컬, 무용, 클래식, 국악, 대중음악 등의 장르를 제공합니다.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'search_events_by_location',
    description: `🎯 스마트 검색 지원! 특정 지역과 기간의 공연을 검색합니다. 
    
4단계 지능형 완화 전략:
• Level 1: 요청 조건 100% 일치
• Level 2: 장르 OR 위치 중 하나만 완화
• Level 3: 장르 + 위치 동시 완화
• Level 4: 기간까지 확장 (이번달 전체)

우선순위 자동 분석:
• "다음주" 등 특정 기간 → 날짜 우선
• 장르/위치는 유사한 것으로 점진적 확장`,
    inputSchema: {
      type: 'object',
      properties: {
        genreCode: {
          type: 'string',
          description: `장르 코드. 사용 가능한 코드: ${GENRE_EXAMPLES}`,
        },
        startDate: {
          type: 'string',
          description: '공연 시작일 (YYYYMMDD 형식)',
          pattern: '^\\d{8}$',
        },
        endDate: {
          type: 'string',
          description: '공연 종료일 (YYYYMMDD 형식)',
          pattern: '^\\d{8}$',
        },
        sidoCode: {
          type: 'string',
          description: `시도 코드 [선택]. 예시: ${SIDO_EXAMPLES}`,
        },
        gugunCode: {
          type: 'string',
          description: `구군 코드 4자리 [선택]. 예시: ${GUGUN_EXAMPLES}. 강남구는 1168, 종로구는 1111입니다.`,
        },
        limit: {
          type: 'number',
          description: '최소 결과 개수 (기본: 3, 최대: 50). 스마트 검색이 이 개수를 달성하려고 자동 완화합니다.',
          default: 3,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['genreCode', 'startDate', 'endDate'],
    },
  },
  {
    name: 'filter_free_events',
    description: `💰 가격 우선 스마트 검색! 무료 공연을 최우선으로 검색합니다 (항상 오늘부터 30일 이내).
    
우선순위:
1. 가격 (40%) - 무료 > 저렴한 순
2. 날짜 (30%) - 오늘~30일 고정
3. 장르 (20%)
4. 위치 (10%)

⚠️ startDate/endDate는 무시되며 항상 오늘~30일 범위로 고정됩니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        genreCode: {
          type: 'string',
          description: `장르 코드. 사용 가능한 코드: ${GENRE_EXAMPLES}`,
        },
        startDate: {
          type: 'string',
          description: '공연 시작일 (무시됨 - 항상 오늘 날짜 사용)',
        },
        endDate: {
          type: 'string',
          description: '공연 종료일 (무시됨 - 항상 오늘+30일 사용)',
        },
        sidoCode: {
          type: 'string',
          description: `시도 코드 [선택]. 예시: ${SIDO_EXAMPLES}`,
        },
        limit: {
          type: 'number',
          description: '결과 개수 (기본: 20, 최대: 50)',
          default: 20,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['genreCode'],
    },
  },
  {
    name: 'get_event_detail',
    description: '공연 ID를 사용하여 상세 정보를 조회합니다. 시놉시스, 출연진, 관람료, 공연 시간, 연령 제한, 포스터 이미지, 예매 링크 등을 제공합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: '공연 ID (mt20id)',
        },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'get_trending_performances',
    description: `🔥 인기도 우선 스마트 검색! KOPIS 박스오피스 기반 인기 공연을 추천합니다.
    
우선순위:
1. 인기도 (40%) - 오픈런(+30), 공연중(+10), 14일내 종료(+20)
2. 개수 (30%) - 요청 개수 달성
3. 장르 (20%)
4. 날짜 (10%)

해당 장르에 결과가 없으면 전체 장르로 자동 확장합니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        genreCode: {
          type: 'string',
          description: `장르 코드 [선택 - 전체 조회 시 생략]. 사용 가능한 코드: ${GENRE_EXAMPLES}`,
        },
        limit: {
          type: 'number',
          description: '결과 개수 (기본: 20, 최대: 50)',
          default: 20,
          minimum: 1,
          maximum: 50,
        },
      },
      additionalProperties: false,
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const apiKey = config.kopisApiKey;
    if (!apiKey) {
      throw new Error('KOPIS API key is required. Please set KOPIS_API_KEY environment variable.');
    }
    
    const kopisService = new KopisService(apiKey);
    const smartSearch = new SmartSearchService(kopisService);

    let result: any;

    switch (name) {
      case 'get_genre_list': {
        result = kopisService.getGenreList();
        const markdown = kopisService.formatGenreListMarkdown(result);
        return {
          content: [
            {
              type: 'text',
              text: markdown,
            },
          ],
        };
      }

      case 'search_events_by_location': {
        if (!args) {
          throw new Error('Arguments are required for search_events_by_location');
        }
        
        // 🎯 스마트 검색 사용
        result = await smartSearch.search(name, args);
        const markdown = kopisService.formatEventsMarkdown({
          events: result.events,
          message: result.message,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: markdown,
            },
          ],
        };
      }

      case 'filter_free_events': {
        if (!args) {
          throw new Error('Arguments are required for filter_free_events');
        }
        
        // 💰 가격 우선 스마트 검색
        result = await smartSearch.search(name, args);
        
        // 무료/유료 분리
        const freeEvents = result.events.filter((e: any) => isFreeEvent(e));
        
        const markdown = kopisService.formatFreeEventsMarkdown({
          events: result.events,
          freeCount: freeEvents.length,
          paidCount: result.events.length - freeEvents.length,
          message: result.message,
          dateRange: '오늘 ~ 30일 후',
        });
        
        return {
          content: [
            {
              type: 'text',
              text: markdown,
            },
          ],
        };
      }

      case 'get_event_detail': {
        if (!args || !args.eventId) {
          throw new Error('eventId is required for get_event_detail');
        }
        result = await kopisService.getEventDetail(args.eventId as string);
        const markdown = kopisService.formatEventDetailMarkdown(result);
        return {
          content: [
            {
              type: 'text',
              text: markdown,
            },
          ],
        };
      }

      case 'get_trending_performances': {
        // 인기도 우선 스마트 검색
        result = await smartSearch.search(name, args || {});
        const markdown = kopisService.formatTrendingMarkdown({
          performances: result.events,
          count: result.events.length,
          message: result.message,
          scoreInfo: '스마트 검색으로 최적화된 결과입니다.',
        });
        return {
          content: [
            {
              type: 'text',
              text: markdown,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const maskedMessage = errorMessage.replace(
      /[a-f0-9]{32,}/gi,
      (match) => `${match.substring(0, 4)}****${match.substring(match.length - 4)}`
    );

    return {
      content: [
        {
          type: 'text',
          text: `❌ **오류 발생**\n\n${maskedMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Streamable HTTP endpoint
app.all('/mcp', async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport();

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Start server
const PORT = config.port;
const httpServer = app.listen(PORT, () => {
  console.log(`[Art-Bridge MCP Server v2.0] Running on port ${PORT}`);
  console.log(`[Feature] 🎯 Smart Search with 4-Level Relaxation Strategy`);
  console.log(`[Feature] 📊 Priority-based Score Calculation`);
  console.log(`[Transport] Streamable HTTP (Stateless)`);
  console.log(`[Endpoint] POST http://localhost:${PORT}/mcp`);
  console.log(`[Health] GET http://localhost:${PORT}/health`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('[Server] Shutting down gracefully...');
  httpServer.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);