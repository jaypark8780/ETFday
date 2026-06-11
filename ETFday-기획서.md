# ETFday 개발 기획서

> **한 줄 요약**: 한국·미국 ETF의 배당락일을 한국시간 기준으로 환산해, "언제까지 사야 배당을 받는지"를 휴장일까지 반영해 알려주는 웹앱.
>
> - 작성일: 2026-06-11
> - 버전: v1.0
> - 백엔드: **Gencow** (docs.gencow.com) / 프론트엔드: Vite + React

---

## 1. 배경 및 문제 정의

### 1.1 문제

ETF 배당(분배금)을 받으려면 "배당락일 전 거래일"까지 매수해야 하지만, 투자자가 실제로 계산하기는 어렵다.

1. **시장마다 결제주기가 다르다** — 미국은 T+1(2024.5.28~), 한국은 T+2(2027년 10월경 T+1 전환 추진 중). 같은 "배당락일"이라도 매수 마감일 계산이 다르다.
2. **시차 혼동** — 미국 장 마감(16:00 ET)은 한국시간으로 다음날 새벽 5시(서머타임) 또는 6시(표준시). "배당락일 전날까지 매수"가 한국시간으로 정확히 언제인지 헷갈린다.
3. **휴장일 변수** — 양국 휴장일이 끼면 "전 거래일"이 달력상 하루 전이 아니다. 미국 추수감사절, 한국 설/추석 연휴 등.
4. **ETF마다 배당 주기·기준일이 제각각** — 월배당/분기배당/연배당, 운용사별 지급기준일 상이.

### 1.2 해결책

사용자가 ETF를 검색하면 **"한국시간 기준 ○월 ○일 (○) ○○:○○까지 주문 체결되어야 배당을 받습니다"** 를 D-day 카운트다운과 함께 보여준다. 계산은 서버의 룰 엔진이 결제주기·휴장일·시차를 모두 반영해 수행한다.

### 1.3 타깃 사용자

- 한국 거주, 한국+미국 ETF에 투자하는 배당 투자자 (월배당 ETF 인기층)
- 배당락일을 놓쳐본 경험이 있거나, 매번 수동으로 계산하는 사람

---

## 2. 핵심 도메인 로직 (가장 중요)

### 2.1 용어 정리

| 용어 | 미국 | 한국 |
|---|---|---|
| 배당락일 (Ex-Dividend Date) | 이날 사면 배당 못 받음 | 분배락일 — 동일 개념 |
| 기준일 (Record Date) | 주주명부 등재일 | 지급기준일 (보통 월말/분기말 마지막 영업일) |
| 지급일 (Pay Date) | 실제 입금일 | 보통 기준일 후 2~10영업일 |

### 2.2 매수 마감일 계산 규칙

```
매수마감일 = 배당락일 직전 "해당 시장" 거래일
배당락일   = 기준일로부터 (결제주기 - 1) 거래일 전     ← 기준일만 알 때 역산

[미국: T+1]
  배당락일 = 기준일 당일 (T+1 전환 후 ex-date == record date가 일반적)
  매수마감 = 배당락일 직전 미국 거래일
  매수마감 시각(한국시간) = 매수마감일 다음날 새벽 05:00(EDT) / 06:00(EST)

[한국: T+2]
  배당락일 = 지급기준일 직전 한국 거래일
  매수마감 = 지급기준일 2거래일 전 (= 배당락일 직전 거래일), 15:30 KST 정규장 마감
```

> **설계 원칙**: 결제주기(T+N)는 하드코딩하지 않고 `markets` 테이블의 설정값으로 둔다. 한국이 2027년 T+1로 전환되면 DB 값 1개만 바꾸면 된다.

### 2.3 계산 알고리즘 (의사코드)

```typescript
function getBuyDeadline(dividend: Dividend, market: Market): BuyDeadline {
  // 1. 배당락일 확정 (데이터에 exDate가 있으면 사용, 없으면 recordDate에서 역산)
  const exDate = dividend.exDate
    ?? subtractTradingDays(dividend.recordDate, market.settlementDays - 1, market.holidays);

  // 2. 매수 마감일 = 배당락일 직전 해당 시장 거래일 (주말 + 휴장일 스킵)
  const lastBuyDate = subtractTradingDays(exDate, 1, market.holidays);

  // 3. 한국시간 환산
  //    KR: lastBuyDate 15:30 KST
  //    US: lastBuyDate 16:00 ET → KST 변환 (DST 자동 반영, 라이브러리: date-fns-tz 또는 Temporal)
  const deadlineKST = toKST(lastBuyDate, market.closeTime, market.timezone);

  return { exDate, lastBuyDate, deadlineKST, isDST: ..., daysLeft: ... };
}
```

`subtractTradingDays`는 주말(토·일)과 `market_holidays` 테이블의 휴장일을 건너뛴다. **단위 테스트 필수 케이스**: 미국 추수감사절 주간, 한국 설 연휴(3일+주말), 연말 연초, 서머타임 전환일(3월/11월).

### 2.4 표기 예시 (UI 문구)

```
SCHD (미국)
배당락일: 2026-06-24 (수)
👉 한국시간 6월 24일 (수) 새벽 4:59까지 체결 완료 필요
   (= 미국 6월 23일 (화) 장 마감 전)
D-13

TIGER 미국배당다우존스 (한국)
지급기준일: 2026-06-30 (화) / 분배락일: 2026-06-29 (월)
👉 6월 26일 (금) 15:30 정규장 마감까지 매수
D-15
```

> **주의 문구(필수 고지)**: "국내 증권사를 통한 미국 주식 주문은 예약주문 처리·결제 지연 가능성이 있으므로 마감 직전 매수는 권장하지 않습니다. 본 서비스는 정보 제공 목적이며 투자 결과에 책임지지 않습니다."

---

## 3. 기능 명세

### 3.1 MVP (Phase 1)

| ID | 기능 | 설명 | 우선순위 |
|---|---|---|---|
| F-01 | ETF 검색 | 티커/이름 검색 (한·미 통합, 자동완성) | P0 |
| F-02 | ETF 상세 | 배당락일, 매수마감(KST), D-day, 배당률, 배당주기, 최근 배당이력 | P0 |
| F-03 | D-day 카운트다운 | "○일 ○시간 남음" 실시간 표시, 마감 임박(48h) 강조 | P0 |
| F-04 | 배당 캘린더 | 월별 캘린더에 배당락일·매수마감일 표시, KR/US 필터 | P0 |
| F-05 | 다가오는 배당락 리스트 | 홈 화면: 마감 임박순 정렬 | P0 |
| F-06 | 휴장일 안내 | 캘린더에 양국 휴장일 표시, 마감일 계산 근거 노출("휴장일로 인해 ○일 앞당겨짐") | P1 |

### 3.2 Phase 2 (회원 기능)

| ID | 기능 | 설명 |
|---|---|---|
| F-07 | 회원가입/로그인 | Gencow better-auth (이메일 + 소셜) |
| F-08 | 관심 ETF (워치리스트) | 등록/해제, 내 워치리스트 마감 임박순 정렬 |
| F-09 | 알림 | 매수마감 D-3, D-1 알림 (이메일 → 추후 웹푸시) |
| F-10 | 배당 수익률 정보 | 연배당률, 배당성장률, 과거 12개월 배당 차트 |

### 3.3 Phase 3 (확장)

- 보유수량 입력 → 예상 배당금 계산 (세전/세후: 미국 15% 원천징수, 국내 15.4%)
- 월배당 포트폴리오 빌더 (1~12월 배당 커버)
- PWA / 모바일 앱 래핑

---

## 4. 화면 설계 (IA)

```
/                  홈 — 다가오는 배당락 Top N (마감 임박순), 검색바
/etf/:ticker       ETF 상세 — D-day 히어로, 매수마감 KST, 배당 이력/배당률
/calendar          월별 배당 캘린더 (KR/US/전체 토글, 휴장일 오버레이)
/watchlist         내 관심 ETF (로그인 필요)
/login, /signup    인증
/settings          알림 설정 (D-3/D-1, 이메일)
```

### 화면별 핵심 요소

**홈 (`/`)**
- 검색바(자동완성) + "오늘 마감" / "이번 주 마감" 섹션
- 카드: 티커, 이름, 국기 아이콘, 배당금, D-day 뱃지(D-1 빨강, D-3 주황)

**ETF 상세 (`/etf/:ticker`)**
- 히어로: D-day 카운트다운(일/시/분) + "한국시간 ○월 ○일 ○요일 ○○:○○까지"
- 타임라인 시각화: 매수마감 → 배당락일 → 기준일 → 지급일
- 계산 근거 펼침: "미국 T+1 결제, 6/25 휴장일 반영" 등 투명하게 노출
- 최근 배당 이력 테이블 + 배당률 차트

**캘린더 (`/calendar`)**
- 날짜 셀에 점(배당락) + 별(매수마감) 구분 표기, 클릭 시 해당일 ETF 리스트
- 휴장일 회색 처리 + 휴장 사유 툴팁

---

## 5. 데이터 설계 (Gencow / Drizzle 스키마)

`gencow/schema.ts` — 공용 데이터는 RLS 없이(public), 사용자 데이터는 `ownerRls()` 적용.

```typescript
import { pgTable, text, timestamp, boolean, integer, numeric, date, serial } from "drizzle-orm/pg-core";
import { ownerRls } from "@gencow/core";
import { user } from "./generated/auth-schema";

// ── 공용 참조 데이터 (RLS 없음, allowAnonymous로 노출) ──────────

// 시장 설정 — 결제주기를 데이터로 관리 (한국 T+1 전환 대비)
export const markets = pgTable("markets", {
  id: text("id").primaryKey(),               // "KR" | "US"
  name: text("name").notNull(),              // "한국거래소", "NYSE/NASDAQ"
  timezone: text("timezone").notNull(),      // "Asia/Seoul", "America/New_York"
  settlementDays: integer("settlement_days").notNull(), // KR=2, US=1
  closeTime: text("close_time").notNull(),   // "15:30", "16:00"
});

export const etfs = pgTable("etfs", {
  id: serial("id").primaryKey(),
  ticker: text("ticker").notNull(),          // "SCHD", "458730"
  name: text("name").notNull(),              // "TIGER 미국배당다우존스"
  marketId: text("market_id").notNull().references(() => markets.id),
  issuer: text("issuer"),                    // "미래에셋", "Schwab"
  frequency: text("frequency"),              // "monthly" | "quarterly" | "annual"
  dividendYield: numeric("dividend_yield"),  // 최근 12개월 배당률(%)
  expenseRatio: numeric("expense_ratio"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dividends = pgTable("dividends", {
  id: serial("id").primaryKey(),
  etfId: integer("etf_id").notNull().references(() => etfs.id, { onDelete: "cascade" }),
  exDate: date("ex_date"),                   // 배당락일 (없으면 recordDate에서 역산)
  recordDate: date("record_date"),           // 기준일/지급기준일
  payDate: date("pay_date"),
  amount: numeric("amount"),                 // 주당 분배금
  currency: text("currency").notNull(),      // "KRW" | "USD"
  isEstimated: boolean("is_estimated").default(false).notNull(), // 과거 패턴 기반 예상치 여부
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const marketHolidays = pgTable("market_holidays", {
  id: serial("id").primaryKey(),
  marketId: text("market_id").notNull().references(() => markets.id),
  date: date("date").notNull(),
  name: text("name"),                        // "Thanksgiving", "설날"
});

// ── 사용자 데이터 (ownerRls — 자동 사용자 격리) ──────────────────

export const watchlists = pgTable("watchlists", {
  id: serial("id").primaryKey(),
  etfId: integer("etf_id").notNull().references(() => etfs.id, { onDelete: "cascade" }),
  notifyD3: boolean("notify_d3").default(true).notNull(),
  notifyD1: boolean("notify_d1").default(true).notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [ownerRls(t)]);

// 알림 발송 이력 (중복 발송 방지)
export const notificationLogs = pgTable("notification_logs", {
  id: serial("id").primaryKey(),
  dividendId: integer("dividend_id").notNull().references(() => dividends.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),              // "D3" | "D1"
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [ownerRls(t)]);
```

---

## 6. API 설계 (Gencow procedures)

### 6.1 공개 API — `allowAnonymous` (비로그인 사용 가능)

```typescript
// gencow/etfs.ts
import { createCrud, procedure } from "./runtime";
import { v } from "@gencow/core";
import { etfs } from "./schema";

// 기본 CRUD — 검색·필터·페이지네이션 내장
export const { list, get } = createCrud(etfs, { allowAnonymous: true });
// 프론트: useQuery(api.etfs.list, { search: "SCHD" }, { public: true })
```

```typescript
// gencow/dividends.ts — 커스텀 조회 (조인·계산 필요 → procedure.query)
export const upcoming = procedure.query
  .name("dividends.upcoming")
  .allowAnonymous()
  .input(v.object({
    market: v.optional(v.string()),   // "KR" | "US" | undefined(전체)
    limit: v.optional(v.number()),
  }))
  .handler(async ({ context: ctx, input }) => {
    // etfs ⨝ dividends ⨝ markets, exDate >= today
    // 각 행에 getBuyDeadline() 적용 → deadlineKST, daysLeft 포함해 반환
    // 정렬: deadlineKST asc
  });

export const calendarMonth = procedure.query
  .name("dividends.calendarMonth")
  .allowAnonymous()
  .input(v.object({ year: v.number(), month: v.number(), market: v.optional(v.string()) }))
  .handler(/* 해당 월의 배당락일·매수마감일·휴장일 묶음 반환 */);

export const detail = procedure.query
  .name("dividends.detail")
  .allowAnonymous()
  .input(v.object({ ticker: v.string() }))
  .handler(/* ETF 정보 + 다음 배당 + 매수마감 + 최근 12회 이력 */);
```

### 6.2 인증 API (로그인 필요 — ownerRls로 자동 격리)

```typescript
// gencow/watchlists.ts
export const { list, create, remove, update } = createCrud(watchlists);
// 프론트: useQuery(api.watchlists.list) — 토큰 자동 전송, 본인 데이터만 반환

export const myUpcoming = procedure.query
  .name("watchlists.myUpcoming")
  .handler(/* 내 관심 ETF의 다가오는 배당락 — 마감 임박순 */);
```

### 6.3 매수마감 계산 모듈

`gencow/lib/deadline.ts` — §2.3 알고리즘 구현. 서버에서만 계산하고 결과(`deadlineKST`, `lastBuyDate`, `reason[]`)를 내려보낸다. 클라이언트는 카운트다운 렌더링만 담당 → 계산 로직 일원화.

---

## 7. 데이터 수집 (크론잡)

`gencow/crons.ts`:

```typescript
import { cronJobs } from "@gencow/core";
const crons = cronJobs();

// ⚠️ Gencow 클라우드 크론은 UTC 기준. KST = UTC+9
crons.daily("syncUsDividends", { hour: 22, minute: 0 }, "sync.usDividends");  // KST 07:00
crons.daily("syncKrDividends", { hour: 9,  minute: 0 }, "sync.krDividends");  // KST 18:00 (장 마감 후 공시 반영)
crons.weekly("syncHolidays", { dayOfWeek: 1, hour: 1 }, "sync.holidays");     // 매주 월 KST 10:00
crons.daily("sendD3Alerts", { hour: 0, minute: 0 }, "alerts.sendDaily");      // KST 09:00 — D-3/D-1 알림
crons.daily("refreshYield", { hour: 23, minute: 0 }, "sync.refreshYield");    // 배당률 재계산

export default crons; // ← 필수! 없으면 잡 등록 안 됨
```

> Gencow 규칙: 클라우드 배포 시 크론 핸들러는 **문자열 mutation 이름**(`"sync.usDividends"`)만 지원. `gencow/index.ts`에 `export * as sync from "./sync"` 등록 필수.

### 7.1 데이터 소스

| 데이터 | 소스 후보 | 비고 |
|---|---|---|
| 미국 ETF 배당 일정 | Polygon.io, Financial Modeling Prep, EODHD, Nasdaq API | 유료 API 권장(정확성). MVP는 FMP 무료 티어로 시작 가능 |
| 한국 ETF 분배금 | KRX 정보데이터시스템(data.krx.co.kr), 세이브로(seibro.or.kr), 각 운용사 공시 | 공식 OpenAPI 없으면 공시 크롤링. 지급기준일은 운용사 규칙 기반 예상치 + 확정 공시로 갱신 |
| 미국 휴장일 | NYSE 공식 캘린더 (연 1회 갱신, 정적 데이터 + 연간 검증) | |
| 한국 휴장일 | KRX 휴장일 안내 | 임시 휴장 대응 위해 주간 동기화 |
| 환율 (Phase 3) | 한국수출입은행 OpenAPI | 예상 배당금 원화 환산용 |

> **한국 ETF 데이터 전략**: 월배당 ETF는 지급기준일이 "매월 마지막 영업일"로 규칙적 → 규칙 엔진으로 미래 일정 생성(`isEstimated: true`), 운용사 공시 확정 시 실제값으로 교체. UI에 "예상" 뱃지 표시.

---

## 8. 기술 스택 정리

| 레이어 | 선택 | 근거 |
|---|---|---|
| 프론트 | Vite + React + TypeScript | Gencow 기본 권장 조합 |
| 상태/데이터 | `@gencow/react` `useQuery`/`useMutation` | WebSocket 실시간 — 배당 데이터 갱신 시 화면 자동 반영 |
| 스타일 | Tailwind CSS | 빠른 개발 |
| 날짜/시간 | `date-fns` + `date-fns-tz` (또는 Temporal) | **DST 자동 처리 필수** — 직접 UTC offset 계산 금지 |
| 백엔드 | Gencow (Bun + Hono + Drizzle + PostgreSQL) | 인증·실시간·크론·배포 내장 |
| 인증 | Gencow better-auth | 이메일/소셜 |
| 이메일 알림 | Resend 등 외부 API (크론 mutation에서 fetch) | |
| 배포 | `gencow dev` → `https://etfday.gencow.app` | 추후 커스텀 도메인 |

---

## 9. 개발 로드맵

| 단계 | 기간(예상) | 내용 | 완료 기준 |
|---|---|---|---|
| M1 | 1주 | 프로젝트 셋업, 스키마, 시드 데이터(인기 ETF 30종), 휴장일 입력 | `gencow db:push` + 시드 완료 |
| M2 | 1주 | **매수마감 계산 모듈 + 단위 테스트** | 휴장일/DST 엣지케이스 테스트 통과 |
| M3 | 2주 | 홈/상세/캘린더 화면, 공개 API | MVP 배포 (비로그인) |
| M4 | 1주 | 데이터 동기화 크론 (US API + KR 규칙엔진) | 일일 자동 갱신 동작 |
| M5 | 2주 | 회원/워치리스트/알림 | D-3/D-1 이메일 수신 확인 |
| M6 | 지속 | 배당률 차트, 예상 배당금 계산기, PWA | |

---

## 10. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| 잘못된 마감일 안내 → 사용자 배당 미수령 | 신뢰도 치명타 | ① 계산 근거 UI 노출 ② "1영업일 여유 매수 권장" 고지 ③ 확정 공시 전 데이터 "예상" 뱃지 ④ 핵심 로직 단위 테스트 |
| 한국 ETF 공식 API 부재 | 데이터 수집 비용 | 규칙 엔진 + 공시 크롤링 이원화, 초기엔 인기 ETF 수동 검수 |
| 결제주기 제도 변경 (한국 T+1, 2027년경) | 계산 로직 전면 영향 | `markets.settlementDays` 설정값으로 분리 — 코드 수정 불필요 |
| DST 전환 주간 오표기 | 시간 오차 1시간 | 타임존 라이브러리 사용 + 3월/11월 전환일 테스트 케이스 |
| 무료 API 한도 초과 | 데이터 누락 | 일 1회 배치 + DB 캐시, 호출량 모니터링 |
| 투자 손실 책임 분쟁 | 법적 리스크 | 면책 고지 상시 노출, "정보 제공 목적" 명시 |

---

## 11. 부록 — 핵심 규칙 요약 카드 (UI 도움말용)

```
🇺🇸 미국 ETF (T+1 결제, 2024.5.28~)
   배당락일 "전날"의 미국 장 마감(한국시간 다음날 새벽 5~6시)까지 체결
   ※ 서머타임(3월 둘째 일요일~11월 첫 일요일): 새벽 5시 / 그 외: 새벽 6시

🇰🇷 한국 ETF (T+2 결제)
   지급기준일 2영업일 전(= 분배락일 전 거래일) 15:30까지 매수
   월배당 ETF는 보통 "매월 마지막 영업일"이 지급기준일
   → 월말 마지막 영업일 기준 2영업일 전까지!

⚠️ 휴장일이 끼면 마감이 더 앞당겨집니다. 앱이 자동 계산해드려요.
```
