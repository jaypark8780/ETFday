/**
 * gencow/lib/deadline-db.ts — DB 조회 + 매수마감 계산 결합 헬퍼
 * (procedure 핸들러들이 공유)
 */
import { gte } from "drizzle-orm";
import { markets, marketHolidays } from "../schema";
import { getBuyDeadline, type MarketRule, type DeadlineResult } from "./deadline";

export interface MarketContext {
    rules: Map<string, MarketRule>; // marketId → 규칙
    holidays: Map<string, Set<string>>; // marketId → 휴장일 집합
}

/** 오늘 날짜 (KST 기준 "YYYY-MM-DD") */
export function todayKST(): string {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 시장 규칙 + 휴장일 로드 (fromDate 이후 휴장일만) */
export async function loadMarketContext(
    db: any,
    fromDate: string,
): Promise<MarketContext> {
    const marketRows = await db.select().from(markets);
    const rules = new Map<string, MarketRule>();
    for (const m of marketRows) {
        rules.set(m.id, {
            id: m.id,
            settlementDays: m.settlementDays,
            closeTime: m.closeTime,
        });
    }

    const holidayRows = await db
        .select()
        .from(marketHolidays)
        .where(gte(marketHolidays.date, fromDate));
    const holidays = new Map<string, Set<string>>();
    for (const h of holidayRows) {
        if (!holidays.has(h.marketId)) holidays.set(h.marketId, new Set());
        holidays.get(h.marketId)!.add(h.date);
    }

    return { rules, holidays };
}

/** 배당 1건의 매수마감 계산 (시장 규칙 없으면 null) */
export function computeDeadline(
    dividend: { exDate?: string | null; recordDate?: string | null },
    marketId: string,
    mctx: MarketContext,
): DeadlineResult | null {
    const rule = mctx.rules.get(marketId);
    if (!rule) return null;
    if (!dividend.exDate && !dividend.recordDate) return null;
    return getBuyDeadline(dividend, rule, mctx.holidays.get(marketId) ?? new Set());
}
