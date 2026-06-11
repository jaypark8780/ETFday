/**
 * gencow/seed.ts — 개발용 시드 데이터 (mutation: "seed.run")
 *
 * 실행: 로그인 후 RPC 호출 또는 Admin Dashboard에서 seed.run 실행.
 * 멱등: markets/holidays/etfs는 존재 시 스킵.
 *
 * ⚠️ 휴장일은 개발용 샘플 — 운영 전 KRX·NYSE 공식 공지로 검증 필수.
 *    (한국 휴장일은 대체공휴일·임시휴장 변동 가능)
 */
import { mutation } from "@gencow/core";
import { eq, and } from "drizzle-orm";
import { markets, marketHolidays, etfs, dividends } from "./schema";

const MARKETS = [
    { id: "KR", name: "한국거래소", timezone: "Asia/Seoul", settlementDays: 2, closeTime: "15:30" },
    { id: "US", name: "NYSE/NASDAQ", timezone: "America/New_York", settlementDays: 1, closeTime: "16:00" },
];

// NYSE 2026 휴장일 (공식 규칙 기반)
const US_HOLIDAYS_2026 = [
    ["2026-01-01", "New Year's Day"],
    ["2026-01-19", "Martin Luther King Jr. Day"],
    ["2026-02-16", "Washington's Birthday"],
    ["2026-04-03", "Good Friday"],
    ["2026-05-25", "Memorial Day"],
    ["2026-06-19", "Juneteenth"],
    ["2026-07-03", "Independence Day (observed)"],
    ["2026-09-07", "Labor Day"],
    ["2026-11-26", "Thanksgiving Day"],
    ["2026-12-25", "Christmas Day"],
] as const;

// KRX 2026 휴장일 — ⚠️ 샘플 (공휴일 규칙 기반 추정, 공식 공지로 검증 필요)
// 근로자의날·연말 폐장은 KRX 고유 휴장 규칙. 대체공휴일은 공휴일이 일요일/공휴일과 겹칠 때 적용.
const KR_HOLIDAYS_2026 = [
    ["2026-01-01", "신정"],
    ["2026-02-16", "설 연휴"],
    ["2026-02-17", "설날"],
    ["2026-02-18", "설 연휴"],
    ["2026-03-02", "삼일절 대체공휴일"],
    ["2026-05-01", "근로자의날"],
    ["2026-05-05", "어린이날"],
    ["2026-05-25", "부처님오신날 대체공휴일"],
    ["2026-08-17", "광복절 대체공휴일"],
    ["2026-09-24", "추석 연휴"],
    ["2026-09-25", "추석"],
    ["2026-09-28", "추석 대체공휴일"],
    ["2026-10-05", "개천절 대체공휴일"],
    ["2026-10-09", "한글날"],
    ["2026-12-25", "성탄절"],
    ["2026-12-31", "연말 휴장"],
] as const;

// 인기 ETF 샘플 (개발용 — 배당률 등은 동기화 크론이 갱신)
const ETF_SEED = [
    { ticker: "SCHD", name: "Schwab US Dividend Equity ETF", marketId: "US", issuer: "Schwab", frequency: "quarterly" },
    { ticker: "JEPI", name: "JPMorgan Equity Premium Income ETF", marketId: "US", issuer: "JPMorgan", frequency: "monthly" },
    { ticker: "JEPQ", name: "JPMorgan Nasdaq Equity Premium Income ETF", marketId: "US", issuer: "JPMorgan", frequency: "monthly" },
    { ticker: "VOO", name: "Vanguard S&P 500 ETF", marketId: "US", issuer: "Vanguard", frequency: "quarterly" },
    { ticker: "DIA", name: "SPDR Dow Jones Industrial Average ETF", marketId: "US", issuer: "State Street", frequency: "monthly" },
    { ticker: "458730", name: "TIGER 미국배당다우존스", marketId: "KR", issuer: "미래에셋", frequency: "monthly" },
    { ticker: "441640", name: "KODEX 미국배당프리미엄액티브", marketId: "KR", issuer: "삼성", frequency: "monthly" },
    { ticker: "0098B0", name: "KODEX 200타겟위클리커버드콜 (예시)", marketId: "KR", issuer: "삼성", frequency: "monthly" },
];

export async function seedAll(db: any, refresh?: (key: string) => void) {
        const result = { markets: 0, holidays: 0, etfs: 0 };

        for (const m of MARKETS) {
            const exists = await db.select().from(markets).where(eq(markets.id, m.id)).limit(1);
            if (exists.length === 0) {
                await db.insert(markets).values(m);
                result.markets++;
            }
        }

        const allHolidays = [
            ...US_HOLIDAYS_2026.map(([date, name]) => ({ marketId: "US", date, name })),
            ...KR_HOLIDAYS_2026.map(([date, name]) => ({ marketId: "KR", date, name })),
        ];
        for (const h of allHolidays) {
            const exists = await db
                .select()
                .from(marketHolidays)
                .where(and(eq(marketHolidays.marketId, h.marketId), eq(marketHolidays.date, h.date)))
                .limit(1);
            if (exists.length === 0) {
                await db.insert(marketHolidays).values(h);
                result.holidays++;
            }
        }

        for (const e of ETF_SEED) {
            const exists = await db.select().from(etfs).where(eq(etfs.ticker, e.ticker)).limit(1);
            if (exists.length === 0) {
                await db.insert(etfs).values(e);
                result.etfs++;
            }
        }

        // 과거 시드의 플레이스홀더 정리 — 실존하지 않는 티커는 데이터 동기화 불가
        await db.update(etfs).set({ isActive: false }).where(eq(etfs.ticker, "O-ALT"));

    refresh?.("dividends.upcoming");
    return result;
}

/** `gencow db:seed` 공식 컨벤션 — default export */
export default async function seed(ctx: any) {
    return seedAll(ctx.db);
}

/** RPC/Admin Dashboard에서 수동 실행용 */
export const run = mutation("seed.run", {
    handler: async (ctx) => {
        return seedAll(ctx.unsafeDb, (k) => ctx.realtime.refresh(k));
    },
});
