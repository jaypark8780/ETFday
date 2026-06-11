/**
 * gencow/dividends.ts — 배당 일정 공개 조회 API
 *
 *   dividends.upcoming      홈: 다가오는 매수마감 (마감 임박순)
 *   dividends.calendarMonth 캘린더: 월별 배당락·매수마감·휴장일
 *   dividends.detail        상세: ETF + 다음 배당 + 매수마감 + 이력
 */
import { query, v } from "@gencow/core";
import { and, desc, eq, gte, lte, or, isNull } from "drizzle-orm";
import { etfs, dividends, marketHolidays } from "./schema";
import {
    loadMarketContext,
    computeDeadline,
    todayKST,
} from "./lib/deadline-db";

/** 날짜 d에 n일 더한 "YYYY-MM-DD" */
function addDays(s: string, n: number): string {
    const d = new Date(`${s}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** 배당 행 + ETF 행 → 매수마감 포함 응답 객체 */
function toUpcomingItem(row: any, mctx: any) {
    const deadline = computeDeadline(
        { exDate: row.dividend.exDate, recordDate: row.dividend.recordDate },
        row.etf.marketId,
        mctx,
    );
    if (!deadline) return null;
    return {
        etf: {
            id: row.etf.id,
            ticker: row.etf.ticker,
            name: row.etf.name,
            marketId: row.etf.marketId,
            frequency: row.etf.frequency,
            dividendYield: row.etf.dividendYield,
        },
        dividend: {
            id: row.dividend.id,
            exDate: deadline.exDate,
            recordDate: row.dividend.recordDate,
            payDate: row.dividend.payDate,
            amount: row.dividend.amount,
            currency: row.dividend.currency,
            isEstimated: row.dividend.isEstimated,
        },
        lastBuyDate: deadline.lastBuyDate,
        deadlineKST: deadline.deadlineKST,
        reason: deadline.reason,
    };
}

/** 다가오는 배당 행 조회 + 마감 계산 공통 로직 */
export async function fetchUpcoming(db: any, marketFilter?: string) {
    const today = todayKST();
    const mctx = await loadMarketContext(db, addDays(today, -40));

    const conditions = [
        eq(etfs.isActive, true),
        or(
            gte(dividends.exDate, today),
            and(isNull(dividends.exDate), gte(dividends.recordDate, today)),
        ),
    ];
    if (marketFilter) conditions.push(eq(etfs.marketId, marketFilter));

    const rows = await db
        .select({ dividend: dividends, etf: etfs })
        .from(dividends)
        .innerJoin(etfs, eq(dividends.etfId, etfs.id))
        .where(and(...conditions));

    const now = new Date();
    return rows
        .map((r: any) => toUpcomingItem(r, mctx))
        .filter((item: any) => item && new Date(item.deadlineKST) > now)
        .sort((a: any, b: any) => a.deadlineKST.localeCompare(b.deadlineKST));
}

export const upcoming = query("dividends.upcoming", {
    args: {
        market: v.optional(v.string()), // "KR" | "US"
        limit: v.optional(v.number()),
    },
    public: true,
    handler: async (ctx, args) => {
        const items = await fetchUpcoming(ctx.db, args.market);
        return items.slice(0, Math.min(args.limit ?? 20, 100));
    },
});

export const calendarMonth = query("dividends.calendarMonth", {
    args: {
        year: v.number(),
        month: v.number(), // 1~12
        market: v.optional(v.string()),
    },
    public: true,
    handler: async (ctx, args) => {
        const mm = String(args.month).padStart(2, "0");
        const monthStart = `${args.year}-${mm}-01`;
        const monthEnd = addDays(
            args.month === 12
                ? `${args.year + 1}-01-01`
                : `${args.year}-${String(args.month + 1).padStart(2, "0")}-01`,
            -1,
        );
        // 마감일이 배당락일보다 앞서므로 양쪽 10일 여유를 두고 조회
        const fetchFrom = addDays(monthStart, -10);
        const fetchTo = addDays(monthEnd, 10);

        const mctx = await loadMarketContext(ctx.db, addDays(monthStart, -40));

        const conditions = [
            eq(etfs.isActive, true),
            or(
                and(gte(dividends.exDate, fetchFrom), lte(dividends.exDate, fetchTo)),
                and(
                    isNull(dividends.exDate),
                    gte(dividends.recordDate, fetchFrom),
                    lte(dividends.recordDate, fetchTo),
                ),
            ),
        ];
        if (args.market) conditions.push(eq(etfs.marketId, args.market));

        const rows = await ctx.db
            .select({ dividend: dividends, etf: etfs })
            .from(dividends)
            .innerJoin(etfs, eq(dividends.etfId, etfs.id))
            .where(and(...conditions));

        const events = rows
            .map((r: any) => toUpcomingItem(r, mctx))
            .filter(
                (item: any) =>
                    item &&
                    // 배당락일 또는 매수마감일이 해당 월에 걸치는 것만
                    ((item.dividend.exDate >= monthStart && item.dividend.exDate <= monthEnd) ||
                        (item.lastBuyDate >= monthStart && item.lastBuyDate <= monthEnd)),
            );

        const holidayConditions = [
            gte(marketHolidays.date, monthStart),
            lte(marketHolidays.date, monthEnd),
        ];
        if (args.market) holidayConditions.push(eq(marketHolidays.marketId, args.market));
        const holidays = await ctx.db
            .select()
            .from(marketHolidays)
            .where(and(...holidayConditions));

        return { events, holidays };
    },
});

export const detail = query("dividends.detail", {
    args: { ticker: v.string() },
    public: true,
    handler: async (ctx, args) => {
        const [etf] = await ctx.db
            .select()
            .from(etfs)
            .where(eq(etfs.ticker, args.ticker.toUpperCase()))
            .limit(1);
        if (!etf) return null;

        const today = todayKST();
        const mctx = await loadMarketContext(ctx.db, addDays(today, -40));

        // 다음 배당 (가장 가까운 미래)
        const upcomingRows = await ctx.db
            .select()
            .from(dividends)
            .where(
                and(
                    eq(dividends.etfId, etf.id),
                    or(
                        gte(dividends.exDate, today),
                        and(isNull(dividends.exDate), gte(dividends.recordDate, today)),
                    ),
                ),
            );

        const now = new Date();
        const nextList = upcomingRows
            .map((d: any) => {
                const deadline = computeDeadline(d, etf.marketId, mctx);
                return deadline && new Date(deadline.deadlineKST) > now
                    ? { dividend: d, ...deadline }
                    : null;
            })
            .filter(Boolean)
            .sort((a: any, b: any) => a.deadlineKST.localeCompare(b.deadlineKST));

        // 최근 배당 이력 12회
        const history = await ctx.db
            .select()
            .from(dividends)
            .where(and(eq(dividends.etfId, etf.id), lte(dividends.exDate, today)))
            .orderBy(desc(dividends.exDate))
            .limit(12);

        return { etf, next: nextList[0] ?? null, history };
    },
});
