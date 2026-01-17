# Art-Bridge MCP Server

한국 공연예술 정보 제공 MCP 서버입니다. KOPIS(공연예술통합전산망) API를 활용하여 다양한 공연 정보를 제공합니다.

## ✨ 주요 특징

- **✅ PlayMCP 완벽 호환**: MCP 2025-03-26 최신 스펙 준수
- **📝 Markdown 응답**: 읽기 쉬운 형식으로 정보 제공
- **🔑 헤더 인증 지원**: `X-Kopis-Api-Key` 커스텀 헤더 방식
- **🚫 Stateless**: 세션 없이 안정적인 서비스
- **📏 24KB 응답 제한**: PlayMCP 정책 준수
- **🎯 5개 Tool**: 적정 개수 (3~20개 권장 범위)
- **🐳 Production Ready**: Docker, Health check, Graceful shutdown

## 🚀 빠른 시작

### 사전 요구사항

- Node.js ≥ 20.0.0
- KOPIS API 키 ([발급 받기](http://www.kopis.or.kr/por/cs/openapi/openApiList.do))

### 설치 및 실행

```bash
# 1. 저장소 클론
git clone <repository-url>
cd art-bridge-mcp-server

# 2. 의존성 설치
npm install

# 3. 환경 변수 설정 (로컬 테스트용)
cp .env.example .env
# .env에서 KOPIS_API_KEY 설정 (선택사항)

# 4. 개발 모드 실행
npm run dev

# 또는 프로덕션 빌드 후 실행
npm run build
npm start
```

서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

## 🔑 인증 방법

API 키는 다음 3가지 방법으로 제공할 수 있습니다 (우선순위 순):

### 1. X-Kopis-Api-Key 헤더 (권장 - PlayMCP용)
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-Kopis-Api-Key: your_api_key_here" \
  -d '{"jsonrpc":"2.0","method":"tools/list"}'
```

### 2. Authorization Bearer 토큰
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key_here" \
  -d '{"jsonrpc":"2.0","method":"tools/list"}'
```

### 3. 환경 변수 (로컬 개발용)
```bash
# .env 파일에 설정
KOPIS_API_KEY=your_api_key_here
```

## 📋 주요 기능 (5개 Tool)

### 1. 장르 목록 조회 (`get_genre_list`)

사용 가능한 모든 공연 장르 코드와 이름을 제공합니다.

**장르 코드:**
- `AAAA`: 연극
- `GGGA`: 뮤지컬
- `BBBC`: 무용(서양/한국무용)
- `BBBE`: 대중무용
- `CCCA`: 서양음악(클래식)
- `CCCC`: 한국음악(국악)
- `CCCD`: 대중음악
- `EEEA`: 복합
- `EEEB`: 서커스/마술

### 2. 지역별 공연 검색 (`search_events_by_location`)

특정 지역과 기간의 공연을 검색합니다.

**스마트 확장 기능:**
- 검색 결과가 없으면 자동으로 범위 확장
- 구/군 → 시/도 → 전국 순으로 확대

**파라미터:**
```json
{
  "genreCode": "GGGA",
  "startDate": "20260101",
  "endDate": "20260131",
  "sidoCode": "11",       // 선택
  "gugunCode": "1111",    // 선택
  "limit": 20             // 선택 (최대 50)
}
```

**응답 형식:** Markdown (포스터 이미지 포함)

### 3. 무료 공연 검색 (`filter_free_events`)

무료 공연을 우선 검색합니다 (항상 오늘부터 30일 이내).

**스마트 폴백:**
- 무료 공연 10개 우선 수집
- 5개 미만이면 저렴한 유료 공연으로 자동 보충

**⚠️ 주의:** `startDate`/`endDate` 파라미터는 무시되며, 항상 오늘~30일 범위로 고정됩니다.

### 4. 공연 상세 정보 (`get_event_detail`)

공연 ID로 상세 정보를 조회합니다.

**제공 정보:**
- 시놉시스, 출연진, 관람료
- 공연 시간, 연령 제한
- 포스터 이미지 (Markdown 형식)
- 예매 링크

### 5. 인기 공연 추천 (`get_trending_performances`)

KOPIS 박스오피스 순위 기반 추천.

**특징:**
- 인기도(0-100) 기준 정렬
- 14일 이내 종료 공연 가산점 +10
- ⭐ 인기도 80점 이상 표시
- 🔥 7일 이내 마감임박 표시
- 장르별 결과 없으면 전체 장르로 자동 확장

## 🔧 API 엔드포인트

### MCP 엔드포인트
```
POST http://localhost:3000/mcp
```

### Health Check
```bash
curl http://localhost:3000/health
```

**응답 예시:**
```json
{
  "status": "healthy",
  "serverType": "stateless",
  "transport": "streamableHttp",
  "uptime": 123.45,
  "timestamp": "2026-01-17T12:00:00.000Z"
}
```

## 🧪 테스트

### MCP Inspector로 테스트

```bash
# 서버 실행 (터미널 1)
npm start

# Inspector 실행 (터미널 2)
npm run inspector
```

### 수동 테스트 (curl)

```bash
# 1. Initialize 요청
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-Kopis-Api-Key: your_api_key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'

# 2. Tools 목록 조회
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-Kopis-Api-Key: your_api_key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'

# 3. 장르 목록 조회
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-Kopis-Api-Key: your_api_key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_genre_list",
      "arguments": {}
    }
  }'
```

## 🐳 Docker 배포

```bash
# 이미지 빌드
docker build -t art-bridge-mcp .

# 컨테이너 실행 (API 키는 헤더로 제공)
docker run -d \
  -p 3000:3000 \
  -e CORS_ORIGIN=* \
  --name art-bridge-mcp \
  art-bridge-mcp

# 또는 환경 변수로 API 키 설정 (로컬 테스트용)
docker run -d \
  -p 3000:3000 \
  -e KOPIS_API_KEY=your_api_key \
  -e CORS_ORIGIN=* \
  --name art-bridge-mcp \
  art-bridge-mcp

# 로그 확인
docker logs -f art-bridge-mcp

# Health check
curl http://localhost:3000/health
```

## 📊 PlayMCP 심사 정책 준수

### ✅ 기본 심사 정책
- [x] 최소 1개 이상의 Tool 포함 (5개)
- [x] 적정 Tool 개수 (3~20개 권장) - **5개**
- [x] MCP 표준 스펙 준수 (Streamable HTTP, Stateless)
- [x] 자동 생성 플랫폼 사용 안 함
- [x] LLM 기본 기능 확장 (공연 정보 전문 검색)

### ✅ Tool의 동작
- [x] 모든 Tool 실제 동작 테스트 완료
- [x] 적절한 응답 속도 (timeout 없음)
- [x] Markdown 형식 응답 (권장)
- [x] **24KB 응답 크기 제한** (자동 truncate)
- [x] 상업적 링크 최소화 (공식 예매 링크만)
- [x] 보안상 안전한 응답

### ✅ Name / Description 규칙
- [x] "kakao" prefix/suffix 미사용
- [x] Tool Description 상세 기술 (한국어)
- [x] 간결한 서비스 명칭
- [x] 중복 키워드 지양

### ✅ 개인정보
- [x] 불필요한 개인정보 수집 안 함
- [x] 민감 정보 요구/전송 안 함
- [x] OAuth/Token은 Tool 목적만 사용

### ✅ 기타 사항
- [x] 인증 실패 시 401 응답 (구현됨)
- [x] 안정적인 서버 (Health check)
- [x] 적절한 대표 이미지 사용 가능
- [x] Resource/Prompt 미사용 (현재 PlayMCP 미지원)

## 📚 지역 코드 참고

### 시도 코드 (sidoCode)
- `11`: 서울특별시
- `26`: 부산광역시
- `27`: 대구광역시
- `28`: 인천광역시
- `41`: 경기도
- `50`: 제주특별자치도

### 구군 코드 (gugunCode) - 서울 예시
- `1111`: 강남구
- `1114`: 강동구
- `1117`: 강북구
- `1120`: 강서구

전체 코드는 [KOPIS 공통코드 문서](http://www.kopis.or.kr/por/cs/openapi/openApiList.do) 참조

## 🛠️ 개발 명령어

```bash
npm run dev         # 개발 모드 (hot-reload)
npm run build       # TypeScript 빌드
npm start           # 프로덕션 실행
npm run typecheck   # 타입 검사
npm run lint        # ESLint 검사
npm run inspector   # MCP Inspector 실행
```

## 📦 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `PORT` | 서버 포트 | `3000` |
| `KOPIS_API_KEY` | KOPIS API 키 (선택 - 헤더 권장) | - |
| `CORS_ORIGIN` | CORS 허용 오리진 | `*` |
| `NODE_ENV` | 환경 모드 | `development` |

## 🏗️ 아키텍처

```
┌─────────────────────────────────────┐
│      Express HTTP Server            │  ← API Layer
├─────────────────────────────────────┤
│   Middleware (CORS, JSON)           │
│   Header Auth (X-Kopis-Api-Key)     │  ← PlayMCP 인증
├─────────────────────────────────────┤
│   Stateless MCP Server Core         │  ← Business Logic
│   • 5 Tools (적정 개수)             │
│   • Markdown Formatter              │  ← 읽기 쉬운 응답
│   • 24KB Response Limiter           │  ← PlayMCP 정책
├─────────────────────────────────────┤
│   StreamableHTTP Transport          │  ← MCP Protocol
├─────────────────────────────────────┤
│   KOPIS API Service                 │  ← External API
│   • Smart Fallback Logic            │
│   • Auto Range Expansion            │
└─────────────────────────────────────┘
```

## 🔒 보안 고려사항

- Production 환경에서는 `CORS_ORIGIN`을 특정 도메인으로 제한하세요
- KOPIS API 키는 헤더로 전달하거나 환경 변수로 관리하세요
- HTTPS를 사용하여 API 통신을 암호화하세요
- 인증 실패 시 401 Unauthorized 응답

## 📝 응답 형식 예시

### Markdown 형식 (PlayMCP 권장)
```markdown
# 🎭 공연 검색 결과

> 서울 강남구에서 5개의 공연을 찾았습니다.

**총 5개의 공연**

---

## 1. 뮤지컬 위키드

![포스터](https://kopis-poster-url.jpg)

- 📅 **공연기간**: 2026-01-20 ~ 2026-03-15
- 🏛️ **공연장**: 샤롯데씨어터
- 🎭 **장르**: 뮤지컬
- 📍 **지역**: 서울 강남구
- 🟢 **상태**: 공연중
- 🔗 **공연ID**: `PF123456`
```

## 📄 라이선스

MIT License

## 🤝 기여

이슈와 풀 리퀘스트는 언제나 환영합니다!

## 📞 문의

- KOPIS API 관련: [KOPIS 고객센터](http://www.kopis.or.kr)
- MCP 스펙: [MCP Documentation](https://modelcontextprotocol.io)
- PlayMCP 심사: [PlayMCP 디스코드](https://discord.gg/playmcp)

---

**Made with ❤️ for Korean Performing Arts**