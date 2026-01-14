# Art-Bridge MCP Server

한국 공연예술 정보 제공 MCP 서버입니다. KOPIS(공연예술통합전산망) API를 활용하여 다양한 공연 정보를 제공합니다.

## 주요 기능

### 1. **장르 목록 조회** (`get_genre_list`)
- 사용 가능한 모든 공연 장르 코드와 이름을 제공합니다
- 장르: 연극, 뮤지컬, 무용, 클래식, 국악, 대중음악, 서커스/마술 등

### 2. **지역별 공연 검색** (`search_events_by_location`)
- 특정 지역과 기간의 공연을 검색합니다
- 시도/구군 코드를 사용한 세밀한 지역 필터링
- 기본 5개 결과 제공 (조정 가능)

**입력 파라미터:**
- `genreCode`: 장르 코드 (예: AAAA-연극, GGGA-뮤지컬)
- `startDate`: 공연 시작일 (YYYYMMDD)
- `endDate`: 공연 종료일 (YYYYMMDD)
- `sidoCode`: 시도 코드 (예: 11-서울, 41-경기) [선택]
- `gugunCode`: 구군 코드 (예: 1111-강남구) [선택]
- `limit`: 결과 개수 (기본: 5) [선택]

### 3. **무료 공연 검색** (`filter_free_events`)
- 무료 공연만 필터링하여 검색합니다
- 공연 목록 조회 후 상세 정보를 확인하여 무료 공연만 반환
- 자동으로 여러 공연의 상세 정보를 체인 호출합니다

**입력 파라미터:**
- `genreCode`: 장르 코드
- `startDate`: 공연 시작일 (YYYYMMDD)
- `endDate`: 공연 종료일 (YYYYMMDD)
- `sidoCode`: 시도 코드 [선택]
- `limit`: 결과 개수 (기본: 5) [선택]

### 4. **공연 상세 정보 조회** (`get_event_detail`)
- 공연 ID를 사용하여 상세 정보를 조회합니다
- 시놉시스, 출연진, 관람료, 공연 시간, 연령 제한 등 제공
- 포스터 이미지 및 예매 링크 포함

**입력 파라미터:**
- `eventId`: 공연 ID (mt20id)

### 5. **인기 및 마감임박 공연 추천** (`get_trending_performances`)
- 현재 진행 중인 공연 중 마감이 임박한 공연을 우선 추천
- 종료일이 7일 이내인 공연에 "🔥 마감임박!" 표시
- 장르별 필터링 가능

**입력 파라미터:**
- `genreCode`: 장르 코드 [선택 - 전체 조회 시 생략]
- `limit`: 결과 개수 (기본: 5) [선택]

## 설치 및 설정

### 필수 요구사항
- Node.js 18 이상
- KOPIS API 키 ([KOPIS 공연예술통합전산망](https://www.kopis.or.kr)에서 발급)

### 설치

```bash
npm install
npm run build
```

### Claude Desktop 설정

`claude_desktop_config.json`에 다음을 추가:

```json
{
  "mcpServers": {
    "art-bridge": {
      "command": "node",
      "args": [
        "/path/to/art-bridge/dist/index.js",
        "YOUR_KOPIS_API_KEY"
      ]
    }
  }
}
```

또는 NPX 사용:

```json
{
  "mcpServers": {
    "art-bridge": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-art-bridge",
        "YOUR_KOPIS_API_KEY"
      ]
    }
  }
}
```

## 사용 예시

### 예시 1: 서울 강남구 뮤지컬 검색
```
사용자: 이번 달 강남구에서 하는 뮤지컬 좀 찾아줘

AI가 호출: search_events_by_location({
  genreCode: "GGGA",
  startDate: "20250101",
  endDate: "20250131",
  sidoCode: "11",
  gugunCode: "1111"
})
```

### 예시 2: 무료 공연 찾기
```
사용자: 이번 주말 무료로 볼 수 있는 공연 있을까?

AI가 호출: filter_free_events({
  genreCode: "AAAA",
  startDate: "20250118",
  endDate: "20250119",
  sidoCode: "11"
})
```

### 예시 3: 공연 상세 정보
```
사용자: PF132236 이 공연 자세히 알려줘

AI가 호출: get_event_detail({
  eventId: "PF132236"
})
```

### 예시 4: 마감임박 공연
```
사용자: 곧 끝나는 연극 추천해줘

AI가 호출: get_trending_performances({
  genreCode: "AAAA"
})
```

## 지역 코드 참고

### 시도 코드 (sidoCode)
- 11: 서울특별시
- 26: 부산광역시
- 27: 대구광역시
- 28: 인천광역시
- 29: 광주광역시
- 30: 대전광역시
- 31: 울산광역시
- 36: 세종특별자치시
- 41: 경기도
- 42: 강원도
- 43: 충청북도
- 44: 충청남도
- 45: 전라북도
- 46: 전라남도
- 47: 경상북도
- 48: 경상남도
- 50: 제주특별자치도

### 구군 코드 (gugunCode) - 서울 예시
- 1111: 강남구
- 1114: 강동구
- 1117: 강북구
- 1120: 강서구
- 1121: 관악구
- 1123: 광진구
- 1126: 구로구
- 1129: 금천구
- 1130: 노원구

(전체 지역 코드는 KOPIS 공통코드 문서 참조)

## 장르 코드

- **AAAA**: 연극
- **BBBC**: 무용(서양/한국무용)
- **BBBE**: 대중무용
- **CCCA**: 서양음악(클래식)
- **CCCC**: 한국음악(국악)
- **CCCD**: 대중음악
- **EEEA**: 복합
- **EEEB**: 서커스/마술
- **GGGA**: 뮤지컬

## 기술 스택

- **MCP SDK**: Model Context Protocol 구현
- **TypeScript**: 타입 안전성
- **xml2js**: KOPIS API XML 응답 파싱
- **Zod**: 스키마 검증

## 아키텍처 특징

### 1. API 체이닝
무료 공연 검색 시 자동으로 목록 API → 상세 API를 순차적으로 호출하여 가격 정보를 확인합니다.

### 2. 스마트 필터링
- 마감임박 공연: 종료일 기준 7일 이내 자동 감지
- 무료 공연: 관람료 필드에서 "무료", "0원", "free" 키워드 탐지

### 3. 에러 핸들링
- API 호출 실패 시 명확한 에러 메시지 제공
- 개별 공연 상세 조회 실패 시 스킵하고 계속 진행

## 제한사항

- KOPIS API는 최대 100건까지만 조회 가능
- 무료 공연 검색은 상세 정보를 순차적으로 조회하므로 시간이 소요될 수 있음
- API 키가 필수이며, 서버 시작 시 인자로 전달 필요

## 라이선스

MIT License

## 참고 링크

- [KOPIS 공연예술통합전산망](https://www.kopis.or.kr)
- [MCP Documentation](https://modelcontextprotocol.io)
- [KOPIS Open API 가이드](https://www.kopis.or.kr/por/cs/openapi/openApiInfo.do)