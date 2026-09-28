/** KOPIS pblprfr 응답의 공연 1건 (실제 반환 필드 기준, 전부 optional) */
export interface KopisEvent {
  mt20id?: string;
  prfnm?: string;        // 공연명
  prfpdfrom?: string;    // 시작일 "2026.10.01"
  prfpdto?: string;      // 종료일
  fcltynm?: string;      // 공연장
  genrenm?: string;      // 장르명
  area?: string;         // 지역
  prfstate?: string;     // 공연상태
  poster?: string;
  pcseguidance?: string; // 관람료 안내
  openrun?: string;      // "Y"/"N"
  // 상세(pblprfr/{id})에서 추가되는 필드
  prfcast?: string;
  prfruntime?: string;
  prfage?: string;
  sty?: string;
  dtguidance?: string;
  relates?: { relate?: unknown };
  // 스마트검색이 부여하는 파생 필드
  popularityScore?: number;
  daysUntilEnd?: number;
  indicators?: string;
  rank?: number;
}
