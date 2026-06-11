/**
 * gencow/sync.ts — 외부 데이터 동기화 (크론·온디맨드)
 *
 * 미국 — 무료 소스 우선 (lib/us-free.ts):
 *   sync.usEtfList    Nasdaq 스크리너 → 전체 미국 ETF 목록 임포트 (검색용 마스터)
 *   sync.usDividends  추적 대상(배당이력 보유·관심등록·인기)만 일일 배당 동기화
 *                     소스 체인: Nasdaq → Yahoo → FMP(키 있을 때)
 *   sync.usOne        상세 화면 온디맨드 단일 티커 동기화 (티커당 10분 레이트가드)
 *
 * 한국:
 *   sync.krDividends  운용사 규칙 기반 예상 일정 생성 + 공시 확정 시 교체
 */
import { mutation, v } from "@gencow/core";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { etfs, dividends, watchlists } from "./schema";
import { subtractTradingDays } from "./lib/deadline";
import { loadMarketContext, todayKST } from "./lib/deadline-db";
import {
    fetchNasdaqEtfList,
    fetchNasdaqDividends,
    fetchYahooDividends,
    fetchFmpDividends,
    inferFrequency,
    type UsDividendRow,
} from "./lib/us-free";

/** 목록 임포트 전에도 항상 배당을 동기화할 인기 티커 (부트스트랩) */
const POPULAR_US = [
    "SCHD", "JEPI", "JEPQ", "VOO", "QQQ", "SPY",
    "DIA", "VTI", "QYLD", "XYLD", "TLT", "SPYI",
];

// ═══════════════════════════════════════════════════════════
// 미국 — 배당 upsert (멱등: etfId+exDate 기준, 예상치는 확정값으로 교체)
// ═══════════════════════════════════════════════════════════

async function upsertUsDividend(
    db: any,
    etfId: number,
    r: UsDividendRow,
): Promise<number> {
    const existing = await db
        .select({ id: dividends.id, isEstimated: dividends.isEstimated })
        .from(dividends)
        .where(and(eq(dividends.etfId, etfId), eq(dividends.exDate, r.exDate)))
        .limit(1);

    if (existing.length === 0) {
        await db.insert(dividends).values({
            etfId,
            exDate: r.exDate,
            recordDate: r.recordDate,
            payDate: r.payDate,
            amount: String(r.amount),
            currency: "USD",
            isEstimated: false,
        });
        return 1;
    }
    if (existing[0].isEstimated) {
        await db
            .update(dividends)
            .set({
                recordDate: r.recordDate,
                payDate: r.payDate,
                amount: String(r.amount),
                isEstimated: false,
            })
            .where(eq(dividends.id, existing[0].id));
        return 1;
    }
    return 0;
}

/**
 * 단일 미국 ETF 배당 동기화 — 소스 체인 폴백.
 * Nasdaq(전체 날짜+미래 선언분) → Yahoo(과거 ex+금액) → FMP(키 있을 때).
 * 부수 효과: dividendYield 갱신, frequency 미설정 시 간격으로 추정.
 */
export async function syncUsTickerOnce(
    db: any,
    etf: { id: number; ticker: string; frequency: string | null },
    opts: { fetchImpl?: typeof fetch; apiKey?: string; lookbackDays?: number } = {},
): Promise<{ synced: number; source: string | null }> {
    const fetchFn = opts.fetchImpl ?? fetch;
    const cutoff = new Date(Date.now() - (opts.lookbackDays ?? 400) * 86400_000)
        .toISOString()
        .slice(0, 10);

    let rows: UsDividendRow[] = [];
    let yieldPct: number | null = null;
    let source: string | null = null;

    try {
        const n = await fetchNasdaqDividends(etf.ticker, fetchFn);
        rows = n.rows;
        yieldPct = n.yieldPct;
        if (rows.length > 0) source = "nasdaq";
    } catch (err) {
        console.warn(`[sync.us] ${etf.ticker} nasdaq 실패:`, err);
    }
    if (rows.length === 0) {
        try {
            rows = await fetchYahooDividends(etf.ticker, fetchFn);
            if (rows.length > 0) source = "yahoo";
        } catch (err) {
            console.warn(`[sync.us] ${etf.ticker} yahoo 실패:`, err);
        }
    }
    if (rows.length === 0 && opts.apiKey) {
        try {
            rows = await fetchFmpDividends(etf.ticker, opts.apiKey, fetchFn);
            if (rows.length > 0) source = "fmp";
        } catch (err) {
            console.warn(`[sync.us] ${etf.ticker} fmp 실패:`, err);
        }
    }

    let synced = 0;
    for (const r of rows) {
        if (r.exDate < cutoff) continue; // lookback 창 밖 과거는 스킵 (미래는 항상 포함)
        synced += await upsertUsDividend(db, etf.id, r);
    }

    // ETF 메타 갱신 — 배당률(Nasdaq 제공 시) + 주기 추정(미설정일 때만)
    const updates: Record<string, unknown> = {};
    if (yieldPct != null) updates.dividendYield = String(yieldPct);
    if (!etf.frequency) {
        const freq = inferFrequency(rows.map((r) => r.exDate));
        if (freq) updates.frequency = freq;
    }
    if (Object.keys(updates).length > 0) {
        await db
            .update(etfs)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(etfs.id, etf.id));
    }

    return { synced, source };
}

// ═══════════════════════════════════════════════════════════
// 미국 — 전체 ETF 목록 임포트 (검색용 마스터)
// ═══════════════════════════════════════════════════════════

/** Nasdaq 스크리너 전체 목록 → etfs 테이블에 신규만 삽입 (멱등) */
export async function importUsEtfList(
    db: any,
    fetchFn: typeof fetch = fetch,
): Promise<{ fetched: number; inserted: number; existing: number }> {
    const listings = await fetchNasdaqEtfList(fetchFn);

    const existingRows = await db
        .select({ ticker: etfs.ticker })
        .from(etfs)
        .where(eq(etfs.marketId, "US"));
    const existing = new Set(existingRows.map((r: any) => r.ticker));

    const fresh = listings.filter((l) => !existing.has(l.ticker));
    const CHUNK = 500;
    for (let i = 0; i < fresh.length; i += CHUNK) {
        await db.insert(etfs).values(
            fresh.slice(i, i + CHUNK).map((l) => ({
                ticker: l.ticker,
                name: l.name,
                marketId: "US",
                isActive: true,
            })),
        );
    }
    return {
        fetched: listings.length,
        inserted: fresh.length,
        existing: existing.size,
    };
}

/** 전체 목록 임포트 (멱등·신규만 삽입) — 주간 크론 + 수동 트리거 */
export const usEtfList = mutation("sync.usEtfList", {
    public: true,
    handler: async (ctx) => {
        const result = await importUsEtfList(ctx.db);
        console.log(
            `[sync.usEtfList] fetched=${result.fetched} inserted=${result.inserted}`,
        );
        return result;
    },
});

// ═══════════════════════════════════════════════════════════
// 미국 — 추적 대상 산정 (전체 4,500종을 매일 돌지 않도록 바운드)
// ═══════════════════════════════════════════════════════════

/** 배당 이력 보유 ∪ 관심 등록 ∪ 인기 티커 → 활성 US ETF만 */
async function trackedUsEtfs(db: any): Promise<any[]> {
    const withDividends = await db
        .select({ etfId: dividends.etfId })
        .from(dividends)
        .groupBy(dividends.etfId);
    const watched = await db
        .select({ etfId: watchlists.etfId })
        .from(watchlists)
        .groupBy(watchlists.etfId);
    const trackedIds = new Set<number>(
        [...withDividends, ...watched].map((r: any) => r.etfId),
    );

    const usRows = await db
        .select()
        .from(etfs)
        .where(and(eq(etfs.marketId, "US"), eq(etfs.isActive, true)));
    return usRows.filter(
        (e: any) => trackedIds.has(e.id) || POPULAR_US.includes(e.ticker),
    );
}

// ═══════════════════════════════════════════════════════════
// 미국 — 다음 일정 예상 생성 (이력 마지막 + 주기 → isEstimated)
// ═══════════════════════════════════════════════════════════

/** YYYY-MM-DD에 N개월 더하기 (말일 클램프) */
function addMonthsClamped(dateStr: string, months: number): string {
    const d = new Date(`${dateStr}T12:00:00Z`);
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const lastDay = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
    return d.toISOString().slice(0, 10);
}

/**
 * 마지막 확정 배당락일 + 배당주기로 다음 일정을 추정해 isEstimated=true 삽입.
 * 확정 데이터 수집 시 교체/정리. etfIds를 주면 해당 ETF만 처리 (온디맨드·크론 바운드).
 */
export async function projectUsEstimates(
    db: any,
    etfIds?: number[],
): Promise<{ created: number }> {
    if (etfIds && etfIds.length === 0) return { created: 0 };
    const today = todayKST();
    const mctx = await loadMarketContext(db, today);
    const usHolidays = mctx.holidays.get("US") ?? new Set<string>();

    const conditions = [eq(etfs.marketId, "US"), eq(etfs.isActive, true)];
    if (etfIds) conditions.push(inArray(etfs.id, etfIds));
    const usEtfs = await db
        .select()
        .from(etfs)
        .where(and(...conditions));

    let created = 0;
    for (const etf of usEtfs) {
        const stepMonths =
            etf.frequency === "monthly" ? 1 : etf.frequency === "annual" ? 12 : 3;

        // 마지막 확정 배당락일 (이력 없으면 추정 불가)
        const [latest] = await db
            .select({ exDate: dividends.exDate })
            .from(dividends)
            .where(
                and(
                    eq(dividends.etfId, etf.id),
                    eq(dividends.isEstimated, false),
                    isNotNull(dividends.exDate),
                ),
            )
            .orderBy(desc(dividends.exDate))
            .limit(1);
        if (!latest?.exDate) continue;

        // 미래 일정 점검: 확정이 있으면 남은 예상치 정리, 예상치만 있으면 유지
        const futureRows = await db
            .select({ id: dividends.id, isEstimated: dividends.isEstimated })
            .from(dividends)
            .where(and(eq(dividends.etfId, etf.id), gte(dividends.exDate, today)));
        const confirmedFuture = futureRows.some((r: any) => !r.isEstimated);
        if (confirmedFuture) {
            const staleIds = futureRows
                .filter((r: any) => r.isEstimated)
                .map((r: any) => r.id);
            if (staleIds.length > 0) {
                await db.delete(dividends).where(inArray(dividends.id, staleIds));
            }
            continue;
        }
        if (futureRows.length > 0) continue;

        // 마지막 배당락일 + 주기 → 미래가 될 때까지 굴린 뒤 직전 거래일로 스냅
        let candidate = latest.exDate;
        let next = candidate;
        for (let i = 0; i < 36 && next <= today; i++) {
            candidate = addMonthsClamped(candidate, stepMonths);
            next = subtractTradingDays(candidate, 0, usHolidays);
        }
        if (next <= today) continue;

        await db.insert(dividends).values({
            etfId: etf.id,
            exDate: next,
            currency: "USD",
            isEstimated: true, // 금액 미정 — UI에 [예상] 표시
        });
        created++;
    }
    return { created };
}

// ═══════════════════════════════════════════════════════════
// 미국 — 크론·온디맨드 mutation
// ═══════════════════════════════════════════════════════════

/** 일일 크론: 추적 대상만 소스 체인으로 동기화 + 예상 일정 생성 */
export const usDividends = mutation("sync.usDividends", {
    handler: async (ctx) => {
        const apiKey = process.env.FMP_API_KEY;
        const tracked = await trackedUsEtfs(ctx.db);

        let synced = 0;
        let errors = 0;
        const bySource: Record<string, number> = {};
        for (const etf of tracked) {
            try {
                const r = await syncUsTickerOnce(ctx.db, etf, { apiKey });
                synced += r.synced;
                if (r.source) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
            } catch (err) {
                console.warn(`[sync.usDividends] ${etf.ticker} 실패:`, err);
                errors++;
            }
        }
        const projected = await projectUsEstimates(
            ctx.db,
            tracked.map((e: any) => e.id),
        );
        ctx.realtime.refresh("dividends.upcoming");
        console.log(
            `[sync.usDividends] tracked=${tracked.length} synced=${synced} errors=${errors} sources=${JSON.stringify(bySource)} projected=${projected.created}`,
        );
        return { tracked: tracked.length, synced, errors, bySource, projected: projected.created };
    },
});

/** 온디맨드 레이트가드 — 티커당 10분 (단일 인스턴스 메모리로 충분) */
const usOneLastRun = new Map<string, number>();
const US_ONE_TTL_MS = 10 * 60_000;

/** 상세 화면 온디맨드: 검색으로 찾은(아직 데이터 없는) 미국 ETF 즉시 동기화 */
export const usOne = mutation("sync.usOne", {
    args: { ticker: v.string() },
    public: true,
    handler: async (ctx, args) => {
        const ticker = args.ticker.trim().toUpperCase();
        const last = usOneLastRun.get(ticker);
        if (last && Date.now() - last < US_ONE_TTL_MS) {
            return { skipped: true as const, reason: "recently-synced" };
        }

        const [etf] = await ctx.db
            .select()
            .from(etfs)
            .where(and(eq(etfs.ticker, ticker), eq(etfs.marketId, "US")))
            .limit(1);
        if (!etf) return { skipped: true as const, reason: "not-found" };

        usOneLastRun.set(ticker, Date.now());
        const result = await syncUsTickerOnce(ctx.db, etf, {
            apiKey: process.env.FMP_API_KEY,
        });
        await projectUsEstimates(ctx.db, [etf.id]);
        ctx.realtime.refresh("dividends.upcoming");
        console.log(
            `[sync.usOne] ${ticker} source=${result.source} synced=${result.synced}`,
        );
        return { ...result, skipped: false as const };
    },
});

// ═══════════════════════════════════════════════════════════
// 한국 — 규칙 엔진 (월배당: 지급기준일 = 매월 마지막 영업일)
// ═══════════════════════════════════════════════════════════

export async function generateKrEstimates(db: any): Promise<{ created: number }> {
    const today = todayKST();
    const mctx = await loadMarketContext(db, today);
    const krHolidays = mctx.holidays.get("KR") ?? new Set<string>();

    const krEtfs = await db
        .select()
        .from(etfs)
        .where(and(eq(etfs.marketId, "KR"), eq(etfs.isActive, true)));

    let created = 0;
    for (const etf of krEtfs) {
        if (etf.frequency !== "monthly") continue; // MVP: 월배당만 규칙 생성

        // 이번 달 + 다음 달 지급기준일(월 마지막 영업일) 예상치 생성
        const [y, m] = today.split("-").map(Number);
        for (const offset of [0, 1]) {
            const month = ((m - 1 + offset) % 12) + 1;
            const year = y + Math.floor((m - 1 + offset) / 12);
            const nextMonthFirst =
                month === 12
                    ? `${year + 1}-01-01`
                    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
            const lastDay = new Date(`${nextMonthFirst}T12:00:00Z`);
            lastDay.setUTCDate(lastDay.getUTCDate() - 1);
            const recordDate = subtractTradingDays(
                lastDay.toISOString().slice(0, 10),
                0,
                krHolidays,
            );
            if (recordDate < today) continue;

            // 이미 있으면 스킵 (확정 데이터 우선)
            const existing = await db
                .select()
                .from(dividends)
                .where(
                    and(
                        eq(dividends.etfId, etf.id),
                        eq(dividends.recordDate, recordDate),
                    ),
                )
                .limit(1);
            if (existing.length > 0) continue;

            await db.insert(dividends).values({
                etfId: etf.id,
                recordDate,
                currency: "KRW",
                isEstimated: true,
            });
            created++;
        }
    }
    return { created };
}

export const krDividends = mutation("sync.krDividends", {
    handler: async (ctx) => {
        const result = await generateKrEstimates(ctx.db);
        ctx.realtime.refresh("dividends.upcoming");
        return result;
    },
});

/** 휴장일 동기화 (TODO: KRX·NYSE 공식 소스 연동, 현재는 시드 데이터 사용) */
export const holidays = mutation("sync.holidays", {
    handler: async () => {
        console.log("[sync.holidays] TODO: KRX/NYSE 휴장일 공식 소스 연동");
        return { skipped: true };
    },
});

/** 배당률 재계산 — 동기화 시 Nasdaq yield를 함께 저장하므로 별도 계산 불필요 */
export const refreshYield = mutation("sync.refreshYield", {
    handler: async () => {
        console.log("[sync.refreshYield] Nasdaq yield를 sync.usDividends에서 갱신");
        return { skipped: true };
    },
});
