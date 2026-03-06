# Art-Bridge MCP Server

한국 공연예술 통합전산망 **KOPIS** API를 AI 에이전트가 사용할 수 있도록 래핑한 MCP(Model Context Protocol) 서버입니다. Claude 같은 LLM이 공연 검색, 상세 조회, 인기 추천 등을 자연어로 요청할 수 있습니다.

## Table of Contents

- [Art-Bridge MCP Server](#art-bridge-mcp-server)
  - [Table of Contents](#table-of-contents)
  - [Background](#background)
  - [Install](#install)
  - [Usage](#usage)
  - [API](#api)
  - [Testing](#testing)
  - [License](#license)

## Background

KOPIS API는 장르·지역 조건이 엄격해 결과가 적거나 없는 경우가 잦습니다. Art-Bridge는 이 한계를 AI 에이전트 레이어에서 보완합니다.

**4단계 스마트 완화 전략**으로 조건에 맞는 결과가 부족할 때 자동으로 탐색 범위를 넓혀가고, **우선순위 기반 점수 계산**으로 가장 관련성 높은 결과를 먼저 반환합니다.

```
Level 1  요청 조건 그대로
  ↓ 결과 부족
Level 2  우선순위 낮은 조건 1개 완화
  ↓ 결과 부족
Level 3  우선순위 낮은 조건 2개 완화
  ↓ 결과 부족
Level 4  시/도 전체 + 모든 장르 + 한달 범위
```

각 결과는 가격·날짜·장르·위치·인기도 5개 차원으로 점수를 산출하고, 검색 유형에 따른 가중치(1순위 40%, 2순위 30%, 3순위 20%, 4순위 10%)로 정렬합니다.

## Install

Node.js와 npm이 필요합니다.

```sh
git clone https://github.com/htjworld/art-bridge.git
cd art-bridge
npm install
```

환경변수를 설정합니다.

```sh
cp .env.example .env
```

`.env` 파일에 KOPIS API 키를 입력합니다.

```
KOPIS_API_KEY=your_api_key_here
PORT=3000
```

KOPIS API 키는 [공연예술통합전산망 open API](https://www.kopis.or.kr/por/cs/openapi/openApiUseSend.do) 에서 발급받을 수 있습니다.

## Usage

```sh
npm run build
npm start
```

서버가 실행되면 MCP 엔드포인트와 헬스체크 엔드포인트가 활성화됩니다.

```
POST http://localhost:3000/mcp    ← MCP 프로토콜 엔드포인트
GET  http://localhost:3000/health ← 상태 확인
```

Claude Desktop 등 MCP 클라이언트에서 서버 URL을 등록하면 공연 검색 도구를 자연어로 사용할 수 있습니다.

## API

5개의 MCP 도구를 제공합니다.

---

**`get_genre_list`**

사용 가능한 장르 코드 목록을 반환합니다. 다른 도구 호출 전에 먼저 확인하세요.

---

**`search_events_by_location`**

장르, 날짜, 지역으로 공연을 검색합니다. 결과가 부족하면 4단계 완화 전략이 자동으로 동작합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `genreCode` | string | ✅ | 장르 코드 (예: `GGGA` 뮤지컬, `AAAA` 연극) |
| `startDate` | string | ✅ | 시작일 (`YYYYMMDD`) |
| `endDate` | string | ✅ | 종료일 (`YYYYMMDD`) |
| `sidoCode` | string | | 시/도 코드 (예: `11` 서울) |
| `gugunCode` | string | | 구/군 코드 (예: `1168` 강남구) |
| `limit` | number | | 최소 결과 개수 (기본: 3, 최대: 50) |

날짜 범위가 7일 이하면 날짜를 최우선으로, 그 외에는 날짜 → 위치 → 장르 순으로 우선순위를 자동 결정합니다.

---

**`filter_free_events`**

오늘부터 30일 이내 무료·저렴한 공연을 검색합니다. 날짜는 항상 오늘~30일로 고정되며, 가격 → 날짜 → 장르 → 위치 순으로 우선순위를 적용합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `genreCode` | string | ✅ | 장르 코드 |
| `sidoCode` | string | | 시/도 코드 |
| `limit` | number | | 결과 개수 (기본: 20, 최대: 50) |

무료 공연이 10개 이상이면 무료만, 부족하면 유료 중 저렴한 순으로 보충합니다.

---

**`get_trending_performances`**

KOPIS 박스오피스 기반으로 인기 공연을 추천합니다. 인기도 점수는 오픈런(+30), 공연중(+10), 14일 이내 종료(+20), 7일 이내 마감(+10)으로 산출합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `genreCode` | string | | 장르 코드 (생략 시 전체 장르) |
| `limit` | number | | 결과 개수 (기본: 20, 최대: 50) |

해당 장르에 결과가 없으면 전체 장르로 자동 폴백합니다.

---

**`get_event_detail`**

공연 ID로 상세 정보를 조회합니다. 시놉시스, 출연진, 관람료, 공연 시간, 연령 제한, 예매 링크를 포함합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `eventId` | string | ✅ | 공연 ID (`mt20id`) |

## Testing

서버를 실행한 뒤 아래 요청으로 동작을 확인할 수 있습니다.

**헬스체크**

```sh
curl http://localhost:3000/health
```

**도구 목록 조회**

```sh
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**장르 목록 조회** (`get_genre_list`는 API 호출 없이 로컬 상수를 반환합니다)

```sh
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_genre_list",
      "arguments": {}
    }
  }'
```

**지역별 공연 검색**

```sh
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search_events_by_location",
      "arguments": {
        "genreCode": "GGGA",
        "startDate": "20260301",
        "endDate": "20260331",
        "sidoCode": "11",
        "limit": 3
      }
    }
  }'
```

## License

MIT © htjworld