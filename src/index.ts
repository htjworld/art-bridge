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
import { config } from './config/index.js';

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
    serverType: 'stateless',
    transport: 'streamableHttp',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// MCP Server configuration
const server = new Server(
  {
    name: 'art-bridge-mcp-server',
    version: '1.0.0',
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
    description: '특정 지역과 기간의 공연을 검색합니다. 검색 결과가 없으면 자동으로 구/군 → 시/도 → 전국 순으로 범위를 확장합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        genreCode: {
          type: 'string',
          description: '장르 코드 (예: AAAA-연극, GGGA-뮤지컬)',
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
          description: '시도 코드 (예: 11-서울, 41-경기) [선택]',
        },
        gugunCode: {
          type: 'string',
          description: '구군 코드 (예: 1111-강남구) [선택]',
        },
        limit: {
          type: 'number',
          description: '결과 개수 (기본: 20, 최대: 50)',
          default: 20,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['genreCode', 'startDate', 'endDate'],
    },
  },
  {
    name: 'filter_free_events',
    description: '무료 공연을 우선 검색합니다 (항상 오늘부터 30일 이내). 무료 공연이 5개 미만이면 저렴한 유료 공연으로 자동 보충합니다. ⚠️ startDate/endDate는 무시되며 항상 오늘~30일 범위로 고정됩니다.',
    inputSchema: {
      type: 'object',
      properties: {
        genreCode: {
          type: 'string',
          description: '장르 코드',
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
          description: '시도 코드 [선택]',
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
    description: 'KOPIS 박스오피스 인기 순위 기반으로 공연을 추천합니다. 인기도(0-100) 기준 정렬, 14일 이내 종료 공연에 가산점 부여. 해당 장르에 결과가 없으면 전체 장르로 자동 확장합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        genreCode: {
          type: 'string',
          description: '장르 코드 [선택 - 전체 조회 시 생략]',
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
    // Get API key from environment (Railway will provide via Variables)
    const apiKey = config.kopisApiKey;
    if (!apiKey) {
      throw new Error('KOPIS API key is required. Please set KOPIS_API_KEY environment variable.');
    }
    
    const kopisService = new KopisService(apiKey);

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
        result = await kopisService.searchEventsByLocation(args as any);
        const markdown = kopisService.formatEventsMarkdown(result);
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
        result = await kopisService.filterFreeEvents(args as any);
        const markdown = kopisService.formatFreeEventsMarkdown(result);
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
        result = await kopisService.getTrendingPerformances((args || {}) as any);
        const markdown = kopisService.formatTrendingMarkdown(result);
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
    return {
      content: [
        {
          type: 'text',
          text: `❌ **오류 발생**\n\n${errorMessage}`,
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
  console.log(`[Art-Bridge MCP Server] Running on port ${PORT}`);
  console.log(`[Transport] Streamable HTTP (Stateless)`);
  console.log(`[Endpoint] POST http://localhost:${PORT}/mcp`);
  console.log(`[Health] GET http://localhost:${PORT}/health`);
  console.log(`[Auth] Using KOPIS_API_KEY from environment variables`);
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