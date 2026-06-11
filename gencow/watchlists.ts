/**
 * gencow/watchlists.ts — 관심 ETF (로그인 필요, ownerRls 자동 격리)
 */
import { crud, query } from "@gencow/core";
import { and, eq, gte, or, isNull, inArray } from "drizzle-orm";
import { etfs, dividends, watchlists } from "./schema";
import {
    loadMarketContext,
    computeDeadline,
    todayKST,
} from "./lib/deadline-db";

// list / create / update / remove — ownerRls 자동 감지로 본인 데이터만
export const { list, create, update, remove } = crud(watchlists, {
    prefix: "watchlists", // 테이블명은 watchlist_items지만 API 이름은 유지
    methods: ["list", "get", "create", "update", "remove"],
    allowedFilters: ["etfId"],
}) as any;

/** 내 관심 ETF의 다가오는 매수마감 — 마감 임박순 */
export const myUpcoming = query("watchlists.myUpcoming", {
    handler: async (ctx) => {
        const me = ctx.auth.requireAuth();
        const today = todayKST();

        const myRows = await ctx.db
            .select()
            .from(watchlists)
            .where(eq(watchlists.userId, me.id));
        if (myRows.length === 0) return [];

        const etfIds = myRows.map((w: any) => w.etfId);
        const fromDate = new Date(Date.now() - 40 * 86400 * 1000)
            .toISOString()
            .slice(0, 10);
        const mctx = await loadMarketContext(ctx.db, fromDate);

        const rows = await ctx.db
            .select({ dividend: dividends, etf: etfs })
            .from(dividends)
            .innerJoin(etfs, eq(dividends.etfId, etfs.id))
            .where(
                and(
                    inArray(dividends.etfId, etfIds),
                    or(
                        gte(dividends.exDate, today),
                        and(isNull(dividends.exDate), gte(dividends.recordDate, today)),
                    ),
                ),
            );

        const byEtf = new Map<number, any>();
        const now = new Date();
        for (const r of rows) {
            const deadline = computeDeadline(r.dividend, r.etf.marketId, mctx);
            if (!deadline || new Date(deadline.deadlineKST) <= now) continue;
            const existing = byEtf.get(r.etf.id);
            if (!existing || deadline.deadlineKST < existing.deadlineKST) {
                const watch = myRows.find((w: any) => w.etfId === r.etf.id);
                byEtf.set(r.etf.id, {
                    watchlistId: watch?.id,
                    notifyD3: watch?.notifyD3,
                    notifyD1: watch?.notifyD1,
                    etf: r.etf,
                    dividend: r.dividend,
                    ...deadline,
                });
            }
        }

        return [...byEtf.values()].sort((a, b) =>
            a.deadlineKST.localeCompare(b.deadlineKST),
        );
    },
});
