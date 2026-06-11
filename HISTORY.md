# ETFday 프로젝트 대화 히스토리

> 작성일: 2026-06-11 · Claude(Cowork)와의 작업 기록

---

## 1. 프로젝트 시작 — 기획서 작성 요청

**요청**: ETF마다 배당일이 다르고 한국/미국 시장의 결제주기·시차·휴장일 때문에 배당락일 전 매수 시점이 헷갈리므로, 이를 정리해주는 웹앱의 개발 기획서 작성. 백엔드는 Gencow(docs.gencow.com) 사용.

**확인된 요구사항** (질문/답변):
- 문서 형식: Markdown
- 서비스 범위: 한국 + 미국 ETF
- 부가 기능: 배당 캘린더 뷰, 관심 ETF + 알림, D-day 카운트다운, 배당 수익률 정보
- 분량: 실전 개발용 상세 기획서

**조사 내용**:
- Gencow: Bun + Hono + Drizzle + PostgreSQL 풀스택 프레임워크. 인증(better-auth)·실시간(WebSocket)·크론·클라우드 배포 내장
- 미국: 2024-05-28부터 T+1 결제 → 배당락일 전날까지 매수
- 한국: T+2 결제 (2027년 10월경 T+1 전환 추진 중) → 지급기준일 2영업일 전까지 매수
- 미국장 마감 16:00 ET = 한국시간 다음날 새벽 5시(서머타임)/6시(표준시)

**산출물**: `ETFday-기획서.md`
- 핵심 도메인 로직(매수마감 계산 규칙·의사코드), 기능 명세(MVP/Phase2/3), 화면 설계(IA), DB 스키마, API 설계, 크론잡, 데이터 소스, 로드맵, 리스크 대응
- 설계 원칙: 결제주기(T+N)를 하드코딩하지 않고 `markets` 테이블 설정값으로 관리

---

## 2. 프론트엔드 기획서 작성

**요청**: 기능 및 화면설계 프론트 기획서 작성.

**확인된 요구사항**: 모바일 우선(360~430px), 텍스트 와이어프레임 포함.

**산출물**: `ETFday-프론트기획서.md`
- 디자인 원칙: "답부터 보여준다", 계산 근거 노출, 긴급도 색 규칙(D-1 빨강/D-2~3 주황/D-4~7 노랑), 비로그인 100% 사용
- 7개 화면 와이어프레임: 홈/검색/ETF 상세/캘린더/관심/인증/설정
- 공통 컴포넌트 11종, 화면-API 매핑, 상태·예외 처리 규칙, 접근성 기준, 구현 순서

---

## 3. Gencow 설치

**요청**: 프로젝트에 Gencow 설치.

**진행**:
- Gencow CLI는 Bun 런타임 필수 → 작업환경에 Bun 1.3.14 설치
- `npx gencow init . --force --template default` → 백엔드 스캐폴드 생성 (기존 기획서 보존)
- 프론트 SDK `@gencow/client` + `@gencow/react` v0.2.3 설치 (bun add는 링크 충돌 → npm으로 설치)
- 설치 버전: Gencow CLI **0.1.148**, @gencow/core 0.1.31

**중요 발견**: 설치된 버전은 문서의 최신 API(`createCrud`/`procedure`)와 달리 구 API(`crud`/`query`/`mutation`, `ownerRls(t.userId)`)를 사용 → 실제 패키지 export를 확인 후 그에 맞춰 개발.

---

## 4. 백엔드 구현

**요청**: 진행해주세요 (스키마부터 구현).

**구현 파일**:

| 파일 | 내용 |
|---|---|
| `gencow/schema.ts` | markets, etfs, dividends, market_holidays(공용) + watchlists, notification_logs(사용자) |
| `gencow/lib/deadline.ts` | 매수마감 계산 순수 함수 — 주말·휴장일 스킵, T+N 역산, 미국 DST 자동 판정 → KST 마감시각 |
| `gencow/lib/deadline.test.ts` | 13개 테스트 (추수감사절·설 연휴·DST 경계 등) — 전부 통과 ✅ |
| `gencow/lib/deadline-db.ts` | DB 조회 + 계산 결합 헬퍼 |
| `gencow/etfs.ts` | 공개 검색 API (`crud`, searchFields: ticker/name) |
| `gencow/dividends.ts` | `upcoming`(홈) / `calendarMonth`(캘린더) / `detail`(상세) — 계산 근거 `reason[]` 포함 |
| `gencow/watchlists.ts` | 관심 ETF CRUD + `myUpcoming` |
| `gencow/sync.ts` | 한국 월배당 예상일정 규칙엔진(구현), 미국 API 연동(TODO 스텁) |
| `gencow/alerts.ts` | D-3/D-1 알림 (중복 발송 방지, 이메일 연동 TODO) |
| `gencow/crons.ts` | 크론 5종 (UTC↔KST 환산 주석) |
| `gencow/seed.ts` | 시장 2종, 2026 휴장일(US 확정/KR 추정 ⚠️), 인기 ETF 8종 |

**검증**: `tsc --noEmit` 통과, 테스트 13/13 통과.

---

## 5. 서버 기동 + 프론트엔드 구축

**요청**: 넵 진행해주세요.

**발견**: Gencow는 클라우드 우선 — `gencow dev`는 `gencow login`(브라우저 인증) 필요. 작업환경(샌드박스)에서는 불가 → 사용자 머신에서 실행하도록 안내. `gencow codegen`은 로그인 없이 동작 → `src/gencow/api.ts` 생성 완료.

**프론트 구현** (Vite + React + TS + Tailwind v4):
- `src/pages/Home.tsx` — 오늘/이번 주 마감 섹션, 시장 필터, D-1 카운트다운
- `src/pages/Search.tsx` — 200ms 디바운스 검색, 인기 ETF 칩
- `src/pages/EtfDetail.tsx` — D-day 히어로, 계산 근거 아코디언, 타임라인, 배당 이력, ⭐관심 등록
- `src/pages/Calendar.tsx` — 월간 그리드(★마감 ●배당락 ▨휴장), 날짜 탭 상세
- `src/pages/Watchlist.tsx` — 이메일 로그인/회원가입 + 내 관심 목록
- `src/components/common.tsx`, `src/lib/format.ts`, `src/lib/auth.ts`, `src/App.tsx`(탭바 셸)

**검증**: 타입체크 ✅, vite build ✅ (260KB). `실행가이드.md` 작성.

---

## 6. Gencow 로그인 시도

**요청**: 젠카우 로그인 CLI로 들어가줘.

**결과**: 샌드박스에서 불가 — ① 허용 도메인 제한으로 gencow.app 연결 403, ② `gencow login`은 브라우저 → 토큰 방식이라 사용자 본인 인증 필요. → 사용자 터미널에서 직접 실행 안내.

---

## 7. 배포 에러 #1 — RLS 정책 충돌

**에러**:
```
Deploy failed: Database fallback push failed ...
Is notification_logs.rls_notification_logs_select_0 policy created or renamed from another policy?
❯ + create policy / ~ rename policy ...
```

**원인**: drizzle 푸시가 기존 DB 정책 이름(`rls-delete` 등)과 스키마 선언 이름(`rls_..._select_0`)의 차이를 대화형으로 묻는데, `gencow dev`의 자동 푸시는 응답 불가 → 실패.

**1차 조치**: 수동 `npx gencow db:push`로 "create policy" 선택 안내 + 대시보드에서 테이블 삭제 대안 제시 → **대시보드에서 테이블 삭제 불가** 확인됨.

**2차 조치**: 테이블 이름 변경으로 충돌 회피
- `watchlists` → `watchlist_items` (API 이름은 `prefix: "watchlists"`로 유지)
- `notification_logs` → `alert_logs`
- `drizzle.config.ts` tablesFilter에 구 테이블 제외 추가

---

## 8. 배포 에러 #2 — 새 테이블에서도 동일 충돌

**에러**: `alert_logs.rls_alert_logs_select_0 ... create or rename?` — 방금 만든 새 테이블에서 재발.

**진단**: 테이블 잔재 문제가 아니라 Gencow CLI가 한 번의 푸시 과정에서 RLS 정책을 두 가지 이름 규칙으로 다루는 버그성 충돌 → 이름 변경으로는 해결 불가.

**근본 해결**: DB 레벨 RLS 정책 선언 제거 + 앱 레벨 격리 유지
```ts
// before: pgTable(..., (t) => ownerRls(t.userId))
// after:
export const watchlists = pgTable("watchlist_items", { ... });
registerOwnerRls(watchlists, { columnName: "user_id", readPublic: false });
```
- `registerOwnerRls()` 메타데이터만으로 `crud()`가 모든 쿼리에 `WHERE user_id = 본인` 자동 주입 (Gencow 2-Layer 방어 중 Layer 1 유지, Layer 2 DB 정책만 생략)
- 커스텀 쿼리는 원래 명시적 userId 필터링이라 영향 없음

**결과**: ✅ `Deploy complete (69.9KB, 5.1s)` — 배포 성공.

---

## 9. 배포 성공 후 마무리 이슈들

### 9-1. esbuild 플랫폼 경고
`@esbuild/darwin-arm64 could not be found` — 패키지를 Linux 작업환경에서 설치해 Mac 바이너리 누락. → 사용자 Mac에서 `rm -rf node_modules && npm install` 재설치 안내.

### 9-2. localhost:5456 연결 불가
설치된 Gencow 버전은 dev 모드도 앱을 전부 클라우드에서 실행 (로컬 서버 없음).
- 앱 URL: `https://near-bone-8206.gencow.app`
- 대시보드: `https://gencow.app/apps/near-bone-8206`
- `.env`에 `VITE_API_URL`이 자동 설정되어 프론트는 추가 설정 불필요

### 9-3. 검색 결과 없음 + db:seed "Cloud app is not running"
- 프론트 화면은 뜨지만 검색 결과 없음 → DB 비어 있음 (시드 실패)
- 원인: 이 버전의 dev 클라우드 앱은 **`gencow dev` CLI가 연결된 동안만 깨어 있음** → dev를 끄면 앱도 잠들어 `db:seed` 실패
- 해결: 터미널 ① `npx gencow dev` 켜둔 채 / 터미널 ② `npx gencow db:seed` / 터미널 ③ `npm run dev:web`

---

## 10. 운영 전 TODO 진행 (2026-06-11)

**요청**: ETFday 프로젝트 검토하고 계속 진행.

### 10-1. KRX 휴장일 누락분 추가
검토 중 `KR_HOLIDAYS_2026`에 누락된 2건 발견 — 매수마감 역산에 직접 영향:
- **2026-05-01 (근로자의날)** — KRX 고유 휴장 규칙
- **2026-09-28 (추석 대체공휴일)** — 추석 연휴 중 9/26이 토요일이라 월요일 대체

→ `seed.ts`에 추가. 기존 13개 deadline 테스트는 모두 통과 유지.

### 10-2. FMP 미국 배당 API 연동
`sync.usDividends` 스텁을 실제 구현으로 교체:
- `syncUsDividendsFromFmp(db, apiKey, opts)` 순수 함수로 분리 (fetchImpl 주입 → 테스트 가능)
- 활성 US ETF별 호출. **사용자 제공 문서 확인 후 stable 엔드포인트로 정정**:
  - `GET /stable/dividends?symbol={ticker}&apikey=` (레거시 `/api/v3/historical-price-full/stock_dividend/` 아님)
  - 응답은 플랫 배열 `[...]` (v3의 `{ historical: [...] }` 아님)
  - 빈 날짜는 `""`로 오므로 `emptyToNull()`로 정규화
- `lookbackDays`(기본 7일) 컷오프로 너무 오래된 이력 스킵
- 멱등 처리: `(etfId, exDate)` 중복 체크 → 신규는 insert, 예상치는 확정값으로 교체
- HTTP 에러/배열 아님/네트워크 실패는 ticker 단위로 분리(전체 실패 X)
- `FMP_API_KEY` 미설정 시 기존처럼 스킵

### 10-3. Resend 이메일 알림 연동
`alerts.sendDaily`에 실제 발송:
- `user` 테이블 join으로 이메일 주소 조회 (한 번에 inArray)
- `sendEmailViaResend()` 헬퍼 — D-1(빨강)/D-3(주황) HTML 템플릿, 앱 링크 포함
- 발송 성공한 경우만 `notification_logs` 기록 → 재시도 가능
- `RESEND_API_KEY` 미설정 시 dry-run(로그+로그테이블만, 발송 안 함)
- 환경변수: `RESEND_API_KEY`, `ALERT_FROM_EMAIL`(기본 alerts@etfday.app), `APP_URL`

### 10-4. 검증
- `npm run typecheck` ✅
- `npm run build` ✅ (260KB)
- `bun gencow/lib/deadline.test.ts` ✅ 13/13

### 10-5. FMP 키 실연동 검증 (2026-06-11)
사용자가 `FMP_API_KEY` 제공 → `.env`에 추가하고 라이브 검증:
- **stable 엔드포인트 정확성 확인**: AAPL이 문서 구조 그대로 응답 ✅
- **레거시 v3 완전 폐기 확인**: `historical-price-full/stock_dividend`는 "2025-08-31 이전 가입자만" 에러 → 10-2의 정정이 필수였음
- **무료 플랜 제한 발견**: 시드의 US ETF(SCHD/JEPI/JEPQ/VOO)는 모두 **HTTP 402**(구독 필요). AAPL 등 일부 심볼만 무료. → 라이브 US ETF 데이터를 받으려면 FMP 유료 플랜 필요.
  - 코드는 402를 `res.ok=false`로 우아하게 처리(ticker 단위 경고+스킵, 크래시 없음) — 402 처리 경로 실거래 검증됨
- **lookbackDays 기본값 7→400 변경**: 7일 창은 과거 이력을 버려 상세화면 배당이력·12개월 배당률이 빈 채로 남음. ~13개월로 늘려 이력+예정+배당률 모두 커버 (멱등 dedup으로 일일 재스캔 저비용)
- **end-to-end 파싱 테스트**(임시 스크립트, mock db + 실 fetch): AAPL 5건 정상 동기화, 날짜 정규화/금액 문자열/USD 모두 정상, malformed 0건 ✅

## 11. 브라우저 동작 테스트 (Chrome, 2026-06-11)

배포된 사이트를 실제로 열어 검증:

**발견 1 — 클라우드엔 백엔드만 배포됨**: `https://near-bone-8206.gencow.app/` 는 백엔드 헬스 JSON(`{status:running}`)만 반환. `/search`·`/index.html` 모두 404 → 정적 프론트(`gencow deploy --static dist/`)는 아직 미배포. 프론트는 로컬에서 띄워 클라우드 백엔드에 붙는 구조.

**확인 2 — 백엔드 RPC + 시드 데이터 정상**: `POST /api/query {name,args}` 직접 호출로
- `etfs.list` → 시드 ETF 8종 조회 (KR/US)
- `dividends.upcoming` → 매수마감 계산 결과 + `reason[]` 정상 (한국 ETF: 기준일 6/30 → T+2 역산 → 배당락 6/29 → 마지막 매수 6/26 15:30 KST). **핵심 도메인 로직 end-to-end 작동 확인.**

**발견 3 — 로컬 프론트 → 클라우드 백엔드 CORS 차단**: localhost:5173에서 직접 클라우드 호출 시 `Failed to fetch`. 프리플라이트 응답에 `access-control-allow-origin` 헤더 누락(allow-credentials=true인데). 배포 백엔드가 localhost 오리진 미허용. → 첫 로드 시 홈이 "마감 일정 없어요"로 뜬 원인.

**조치 — Vite 프록시 추가**(`vite.config.ts` `server.proxy['/api']` + `.env`의 `VITE_API_URL=` 빈값): 브라우저는 same-origin `/api` 호출, Vite가 클라우드로 중계 → CORS 제거. 이는 프로덕션(프론트를 백엔드와 같은 오리진에 정적배포)과도 일치하는 상대경로 구조. `VITE_BACKEND_URL`로 프록시 대상 변경 가능.

**프록시 적용 후 전 화면 정상 작동 확인**:
- **홈**: 다가오는 마감 카드 3종(D-15, 6/26 마감, [예상] 태그)
- **상세**(/etf/458730): D-15 카운트다운, "6/26(금) 15:30까지", 계산근거 아코디언(reason 4줄), 일정 타임라인(매수마감→배당락→기준일), 증권사 경고
- **캘린더**: 6/26 ★마감, 6/29 ●배당락, 6/19 ▨휴장(미국 Juneteenth 시드 반영), 오늘 강조
- **검색**: "KODEX" → 디바운스 검색 2건 정확 반환

검증: `npm run typecheck` ✅ (설정 변경 후에도 통과)

## 12. 미국 ETF 검색 + 무료 데이터 소스 전환 (2026-06-11)

**요청**: 미국 ETF가 검색이 안 됨 — 스크래핑으로 검색되게, 무료 소스 우선.

**진단**: 검색 API는 정상(SCHD·소문자도 검색됨). 진짜 원인은 **DB에 미국 ETF가 5종뿐** + FMP 402로 배당 데이터도 없음.

**무료 소스 발굴** (둘 다 키 불필요, 로컬·클라우드 모두 접근 확인):
- **Nasdaq 스크리너** `api.nasdaq.com/api/screener/etf?download=true` → 전체 4,538종 (심볼+이름)
- **Nasdaq 배당 API** `api.nasdaq.com/api/quote/{t}/dividends?assetclass=etf` → ex/기준/지급일+금액+배당률, **선언된 미래 일정 포함** (FMP 유료급 데이터)
- Yahoo chart `events=div` → 과거 ex+금액만 (폴백)

**구현**:
- `gencow/lib/us-free.ts` (신규): fetchNasdaqEtfList / fetchNasdaqDividends / fetchYahooDividends / fetchFmpDividends / inferFrequency(간격 중앙값→주기). 날짜 MM/DD/YYYY→ISO, "N/A"→null 정규화
- `gencow/sync.ts` 개편:
  - `sync.usEtfList` (public, 주간 크론): 전체 목록 임포트, 멱등(신규만 삽입)
  - `syncUsTickerOnce`: 소스 체인 **Nasdaq → Yahoo → FMP(키 있을 때)** + dividendYield 저장 + frequency 미설정 시 추정
  - `sync.usDividends` (일일 크론): 전체 4.5천종이 아니라 **추적 대상만**(배당이력 보유 ∪ 관심등록 ∪ 인기 12종) — 외부 호출 바운드
  - `sync.usOne` (public, args: ticker): 상세 화면 온디맨드 동기화, 티커당 10분 레이트가드
  - projectUsEstimates에 etfIds 필터 추가 (온디맨드·크론 바운드)
- `EtfDetail.tsx`: 미국 ETF인데 배당 데이터 없으면 자동으로 usOne 호출 → refetch. "불러오는 중" 상태 표시
- 크론 추가: 주간 sync.usEtfList (토 KST 08:00)

**프로덕션 검증** (배포 후 실제 URL):
- 클라우드에서 목록 임포트: fetched 4,538 / **inserted 4,533** ✅
- 소스 체인 실동작: QQQ·JEPQ는 nasdaq, SCHD·JEPI·VOO·SPY는 클라우드 IP에서 Nasdaq 차단 시 **yahoo 자동 폴백** ✅ (체인 설계가 실제로 필요했음)
- **검색 "QQQ" → 12종+ 표시** ✅
- QQQ 상세: 분기배당·배당률 0.41%, D-12, 6/23(화) 새벽 5:00 KST 마감, [예상] 타임라인, 이력 4회 ✅
- **QQQM(데이터 0이던 ETF) 상세 열자마자 온디맨드 동기화 → 즉시 D-12 표시** ✅ — 4,533종 어떤 ETF든 열면 작동

---

## 현재 상태 & 남은 작업

**완료**:
- 기획서 2종, 백엔드 전체(스키마/API/크론/계산모듈+테스트), 프론트 MVP 5화면, 클라우드 배포
- KRX 휴장일 보강(2026-05-01, 09-28)
- FMP 미국 배당 동기화 구현 (키 추가 시 즉시 동작)
- Resend 이메일 알림 구현 (키 추가 시 즉시 동작)

**브라우저 테스트로 확인**: 백엔드+시드+도메인 로직+프론트 5화면 모두 정상 (§11)

## 12. 풀스택 공개 배포 (2026-06-11)

**요청**: 프론트도 푸시해서 gencow.app에서 돌아가게.

- `gencow whoami`로 로그인 상태 확인 → 빌드 번들 검증(`near-bone` 하드코딩 0건, 상대경로 `/api/*`만 사용 — same-origin 적합)
- **1차 배포 차단**: gencow 보안 가드가 `admin-http.ts`의 public httpAction + `ctx.unsafeDb` 사용을 거부. 이 파일은 db:seed 우회용 개발 유틸이었고 주석에도 "운영 전 삭제" 명시 → **파일 삭제** + `index.ts` export 제거 (정식 db:seed/seed.run으로 대체)
- 재배포 성공: `gencow deploy --static dist/` → 백엔드(61KB) + 정적 3파일(276KB), https://near-bone-8206.gencow.app 에서 SPA 직접 서빙 확인

## 13. 미국 ETF 데이터 공급 — Yahoo 폴백 + 예상 엔진 (2026-06-11)

**문제**: 배포 후 미국 ETF가 안 나옴. 원인은 §10-5의 FMP 무료 플랜 ETF 402 차단 → US 배당 데이터 0건.

**해결** (`sync.ts`):
1. `fetchYahooDividends()` — Yahoo v8 chart `events=div` (키 불필요, ETF 지원, **비공식 API ⚠️**). 로컬 검증: SCHD/JEPI/JEPQ/VOO/DIA 5종 모두 수집 성공
2. `syncUsDividendsFromYahoo()` — FMP와 동일한 멱등 upsert (exDate 기준, 예상치→확정 교체)
3. `projectUsEstimates()` — **미국판 예상 엔진**: 마지막 확정 배당락일 + 배당주기(월/분기/년)로 다음 배당락일 추정 → isEstimated=true 삽입. 확정 미래 일정이 생기면 남은 예상치 자동 정리. 주말/휴장일은 직전 거래일로 스냅
4. `sync.usDividends` 재구성: FMP(키 있으면) → 신규 0건 시 Yahoo 폴백 → 예상 생성. 크론(매일 KST 07:00) 그대로 사용
5. 시드: 실존하지 않는 `O-ALT` → `DIA`(SPDR Dow Jones, 월배당) 교체 + 기존 O-ALT 비활성화

**클라우드 실행**: 뮤테이션은 인증 필요 + `db:seed`는 "app not running"(dev 연결해도 동일) → **테스트 계정 가입 후 세션 쿠키로 `seed.run`/`sync.usDividends` 호출**
- seed.run → 휴장일 +2(§10-1의 근로자의날·추석 대체), DIA 추가, O-ALT 비활성
- sync.usDividends → **Yahoo 87건 수집(5종, 에러 0) + 예상 5건 생성**

**배포 사이트 검증** (https://near-bone-8206.gencow.app):
- 홈: 🇺🇸 DIA **D-2 주황**(긴급색 규칙 작동) "6/13(토) 새벽 5:00 마감", SCHD D-14, VOO D-15, JEPI/JEPQ D-19
- 미국 필터 정상, DIA 상세: D-2 히어로 + 타임라인(매수마감 6/12→배당락 6/15) + **배당 이력 12회**(Yahoo 데이터)
- 마감시각 "새벽 5:00" = 미국장 16:00 ET 서머타임 환산 정확

**남은 운영 작업**:
1. `RESEND_API_KEY` + `ALERT_FROM_EMAIL`(인증된 도메인) 설정 → 발신 테스트
2. KRX 2026 휴장일 공식 공지로 최종 검증 (현재 규칙 기반 추정)
3. 구 테이블(`watchlists`, `notification_logs`) 잔재 DB에서 정리 — gencow 대시보드/관리 API로
4. **시스템 뮤테이션 권한 강화**: seed.run/sync.* 가 "가입한 아무 사용자"나 호출 가능 (멱등이라 피해는 없지만 admin 체크 권장)
5. Yahoo는 비공식 API — 장기적으로 FMP 유료 또는 Polygon 등 공식 소스 전환 검토
6. 테스트 계정 정리: etfday-admin-test@example.com (클라우드 user 테이블)

## 주요 파일 목록

```
ETFday-기획서.md          서비스 기획서
ETFday-프론트기획서.md     프론트 기능·화면 설계
실행가이드.md              실행/배포 명령 모음
HISTORY.md                이 문서
gencow/                   백엔드 (스키마·API·크론·시드)
gencow/lib/deadline.ts    매수마감 계산 핵심 모듈 (+테스트)
src/                      프론트 (Vite+React, 5개 화면)
```
