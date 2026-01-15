#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
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
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-art-bridge <KOPIS_API_KEY>");
  console.error("Note: You need to provide a valid KOPIS API key to use this server.");
  process.exit(1);
}

// Set API key
const apiKey = args[0];
setApiKey(apiKey);

console.error("Art-Bridge MCP Server initializing with API key...");

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
    title: "인기 및 마감임박 공연 추천",
    description:
      "현재 인기있는 공연과 마감이 임박한 공연을 추천합니다. " +
      "종료일이 7일 이내인 공연에 가산점을 주어 상단에 노출합니다. " +
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

      const formatted = events.map((event, index) => 
        `${index + 1}. ${event.prfnm}${event.isClosingSoon ? ' 🔥 마감임박!' : ''}\n` +
        `   공연장: ${event.fcltynm}\n` +
        `   기간: ${event.prfpdfrom} ~ ${event.prfpdto}\n` +
        `   장르: ${event.genrenm}\n` +
        `   지역: ${event.area}\n` +
        `   ID: ${event.mt20id}`
      ).join('\n\n');

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
let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});


app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.error(`MCP Server running on port ${PORT}`);
});