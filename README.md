# Art-Bridge MCP Server

한국 공연예술 정보 제공 MCP 서버입니다. KOPIS(공연예술통합전산망) API를 활용하여 다양한 공연 정보를 제공합니다.

## 주요 기능

### 1. **장르 목록 조회** (`get_genre_list`)
- 사용 가능한 모든 공연 장르 코드와 이름을 제공합니다
- 장르: 연극, 뮤지컬, 무용, 클래식, 국악, 대중음악, 서커스/마술 등

### 2. **지역별 공연 검색** (`search_events_by_location`)
- 특정 지역과 기간의 공연을 검색합니다
- 시도/구군 코드를 사용한 세밀한 지역 필터링
- 기본 20개 결과 제공 (조정 가능)
- **스마트 확장**: 검색 결과가 없으면 자동으로 구/군 → 시/도 → 전국 순으로 범위 확장

**입력 파라미터:**
- `genreCode`: 장르 코드 (예: AAAA-연극, GGGA-뮤지컬)
- `startDate`: 공연 시작일 (YYYYMMDD)
- `endDate`: 공연 종료일 (YYYYMMDD)
- `sidoCode`: 시도 코드 (예: 11-서울, 41-경기) [선택]
- `gugunCode`: 구군 코드 (예: 1111-강남구) [선택]
- `limit`: 결과 개수 (기본: 20) [선택]

### 3. **무료 공연 검색** (`filter_free_events`)
- 무료 공연 우선 검색 (항상 오늘부터 30일 이내로 고정)
- 전국 무료 공연 10개 우선 수집
- **스마트 차선책**: 무료 공연이 5개 미만이면 저렴한 유료 공연으로 10개 채움
- sidoCode로 지역 필터링 가능
- ⚠️ 중요: startDate/endDate 파라미터는 무시됩니다 (항상 오늘~30일 고정)

**입력 파라미터:**
- `genreCode`: 장르 코드
- `startDate`: 공연 시작일 (YYYYMMDD) - 무시됨
- `endDate`: 공연 종료일 (YYYYMMDD) - 무시됨
- `sidoCode`: 시도 코드 [선택]
- `limit`: 결과 개수 (기본: 20) [선택]

### 4. **공연 상세 정보 조회** (`get_event_detail`)
- 공연 ID를 사용하여 상세 정보를 조회합니다
- 시놉시스, 출연진, 관람료, 공연 시간, 연령 제한 등 제공
- 포스터 이미지 및 예매 링크 포함

**입력 파라미터:**
- `eventId`: 공연 ID (mt20id)

### 5. **인기 및 마감임박 공연 추천** (`get_trending_performances`)
- **KOPIS 박스오피스 인기 순위 기반** 공연 추천
- **인기도(0-100)** 기준으로 정렬 (1위=100점, 순위별 점수 감소)
- 종료일이 **14일 이내**인 공연에 **가산점 +10** 부여
- 기본 20개 결과 제공 (조정 가능)
- **스마트 확장**: 검색 결과가 없으면 전체 장르로 확장하여 추천
- ⭐ 인기도 80점 이상, 🔥 7일 이내 마감임박 이모지 표시

**입력 파라미터:**
- `genreCode`: 장르 코드 [선택 - 전체 조회 시 생략]
- `limit`: 결과 개수 (기본: 20) [선택]

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
        "/path/to/art-bridge/dist/index.js"
      ],
      "env": {
        "KOPIS_API_KEY": "YOUR_KOPIS_API_KEY"
      }
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
        "@modelcontextprotocol/server-art-bridge"
      ],
      "env": {
        "KOPIS_API_KEY": "YOUR_KOPIS_API_KEY"
      }
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
  startDate: "20260101",
  endDate: "20260131",
  sidoCode: "11",
  gugunCode: "1111",
  limit: 20
})

→ 검색 결과가 없으면 자동으로 서울 전체 → 전국으로 확장
```

### 예시 2: 무료 공연 찾기
```
사용자: 이번 주말 무료로 볼 수 있는 공연 있을까?

AI가 호출: filter_free_events({
  genreCode: "AAAA",
  startDate: "20260118",
  endDate: "20260119",
  sidoCode: "11"
})

→ 무료 공연이 부족하면 자동으로 저렴한 유료 공연 포함
```

### 예시 3: 공연 상세 정보
```
사용자: PF132236 이 공연 자세히 알려줘

AI가 호출: get_event_detail({
  eventId: "PF132236"
})
```

### 예시 4: 인기 공연 추천
```
사용자: 요즘 핫한 뮤지컬 추천해줘

AI가 호출: get_trending_performances({
  genreCode: "GGGA",
  limit: 20
})

→ 해당 장르에 인기 공연이 없으면 자동으로 전체 장르로 확장
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

- **MCP SDK**: Model Context Protocol 구현 (v2026-01-16)
- **TypeScript**: 타입 안전성
- **Express**: HTTP 서버
- **xml2js**: KOPIS API XML 응답 파싱
- **Zod**: 스키마 검증

## 아키텍처 특징

### 1. Stateless & Thread-Safe
- **완전한 Stateless 구조**: 세션 관리 제거로 무상태 서버 구현
- **Thread-Safe API 키 관리**: 전역 변수 제거, 함수 파라미터로 전달하여 동시 요청에 안전
- 여러 클라이언트가 동시에 접속해도 API 키 충돌 없음

### 2. 스마트 검색 확장
- **지역별 검색**: 구/군 → 시/도 → 전국 순으로 자동 확장
- **인기 공연**: 특정 장르 → 전체 장르로 자동 확장
- **무료 공연**: 무료 부족 시 저렴한 유료로 자동 보완
- "검색 결과가 없습니다"를 최소화하여 사용자 경험 개선

### 3. API 체이닝
무료 공연 검색 시 자동으로 목록 API → 상세 API를 순차적으로 호출하여 가격 정보를 확인합니다.

### 4. 스마트 추천 알고리즘
- **인기도 기반 추천**: KOPIS 박스오피스 API를 활용하여 실제 인기 순위 데이터 반영
- **마감임박 가산점**: 종료일 기준 14일 이내 공연에 +10 가산점 부여
- **무료 공연 필터링**: 관람료 필드에서 "무료", "0원", "free" 키워드 탐지

### 5. 강력한 에러 핸들링
- API 호출 실패 시 명확한 에러 메시지 제공
- 개별 공연 상세 조회 실패 시 스킵하고 계속 진행
- 박스오피스 API 실패 시에도 기본 검색 결과 제공

## 프로토콜 및 표준 준수

- **MCP 프로토콜 버전**: 2026-01-16 (최소 요구사항 2025-03-26 이상 충족)
- **전송 방식**: Streamable HTTP (SSE)
- **아키텍처**: Stateless (권장사항 준수)
- **인증**: 환경변수 또는 커스텀 헤더 (`kopis_api_key`) 지원

## 제한사항

- KOPIS API는 최대 100건까지만 조회 가능
- 무료 공연 검색은 상세 정보를 순차적으로 조회하므로 시간이 소요될 수 있음
- 박스오피스 순위는 주간 단위로 업데이트됨

## 배포

Railway, Render 등의 플랫폼에서 배포 가능합니다.

**환경변수:**
- `KOPIS_API_KEY`: KOPIS API 인증키 (필수)
- `PORT`: 서버 포트 (기본: 3000)

**엔드포인트:**
- `GET /`: 서버 정보 및 상태 확인
- `GET /health`: 헬스체크
- `GET /sse`: SSE 연결
- `POST /sse`: MCP 메시지 처리

**헤더:**
- `kopis_api_key`: 요청별 API 키 전달 (환경변수 대신 사용 가능)

## 라이선스

MIT License

## 참고 링크

- [KOPIS 공연예술통합전산망](https://www.kopis.or.kr)
- [MCP Documentation](https://modelcontextprotocol.io)
- [KOPIS Open API 가이드](https://www.kopis.or.kr/por/cs/openapi/openApiInfo.do)