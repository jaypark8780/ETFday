/**
 * gencow/alerts.ts — 매수마감 D-3/D-1 알림 (크론: 매일 KST 09:00)
 *
 * 시스템 작업이므로 전체 사용자 워치리스트를 조회해야 함 → ctx.unsafeDb 사용.
 * gencow-allow-unsafe-db reason: 크론이 전체 사용자 알림 대상을 조회해야 함
 *   scope: watchlists/notificationLogs/user 읽기 + 로그 쓰기 owner: etfday test: 수동
 */
import { mutation } from "@gencow/core";
import { and, eq, gte, or, isNull, inArray } from "drizzle-orm";
import { etfs, dividends, watchlists, notificationLogs } from "./schema";
import { user } from "./auth-schema";
import {
    loadMarketContext,
    computeDeadline,
    todayKST,
} from "./lib/deadline-db";

/** deadlineKST까지 남은 일수 (KST 날짜 기준) */
function daysUntil(deadlineKST: string, today: string): number {
    const d1 = new Date(`${deadlineKST.slice(0, 10)}T00:00:00Z`).getTime();
    const d0 = new Date(`${today}T00:00:00Z`).getTime();
    return Math.round((d1 - d0) / 86400000);
}

type AlertKind = "D3" | "D1";

type AlertPayload = {
    to: string;
    kind: AlertKind;
    ticker: string;
    etfName: string;
    deadlineKST: string;
    appUrl: string;
};

/** Resend API로 발송. 키 미설정 시 console.log만 — 호출자가 결정. */
async function sendEmailViaResend(
    apiKey: string,
    from: string,
    p: AlertPayload,
): Promise<{ ok: boolean; status: number }> {
    const dLabel = p.kind === "D1" ? "내일" : "3일 뒤";
    const subject = `[ETFday] ${p.ticker} 매수마감 ${dLabel} (${p.deadlineKST})`;
    const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 16px">${p.ticker} 매수마감 ${dLabel}</h2>
          <p style="margin:0 0 8px"><strong>${p.etfName}</strong></p>
          <p style="margin:0 0 8px">마감 시각 (KST): <strong>${p.deadlineKST}</strong></p>
          <p style="margin:0 0 16px;color:${p.kind === "D1" ? "#dc2626" : "#ea580c"}">
            ${p.kind === "D1" ? "오늘 안에 매수해야 다음 배당을 받습니다." : "3영업일 이내 매수 마감이 도래합니다."}
          </p>
          <p style="margin:24px 0 0;font-size:13px;color:#666">
            <a href="${p.appUrl}" style="color:#2563eb">ETFday에서 확인 →</a>
          </p>
        </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            from,
            to: p.to,
            subject,
            html,
        }),
    });
    return { ok: res.ok, status: res.status };
}

export const sendDaily = mutation("alerts.sendDaily", {
    handler: async (ctx) => {
        const db = ctx.unsafeDb; // 시스템 크론: 전체 사용자 대상
        const today = todayKST();
        const fromDate = new Date(Date.now() - 40 * 86400 * 1000)
            .toISOString()
            .slice(0, 10);
        const mctx = await loadMarketContext(db, fromDate);

        const watchRows = await db.select().from(watchlists);
        if (watchRows.length === 0) return { sent: 0, failed: 0 };

        const etfIds: number[] = [
            ...new Set<number>(watchRows.map((w: any) => w.etfId)),
        ];
        const userIds: string[] = [
            ...new Set<string>(watchRows.map((w: any) => w.userId)),
        ];

        const userRows = await db
            .select({ id: user.id, email: user.email, name: user.name })
            .from(user)
            .where(inArray(user.id, userIds));
        const emailByUserId = new Map<string, string>(
            userRows.map((u: any) => [u.id, u.email]),
        );

        const divRows = await db
            .select({ dividend: dividends, etf: etfs })
            .from(dividends)
            .innerJoin(etfs, eq(dividends.etfId, etfs.id))
            .where(
                and(
                    inArray(dividends.etfId, etfIds),
                    or(
                        gte(dividends.exDate, today),
                        and(
                            isNull(dividends.exDate),
                            gte(dividends.recordDate, today),
                        ),
                    ),
                ),
            );

        const resendKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.ALERT_FROM_EMAIL ?? "alerts@etfday.app";
        const appUrl = process.env.APP_URL ?? "https://etfday.app";

        let sent = 0;
        let failed = 0;
        for (const row of divRows) {
            const deadline = computeDeadline(row.dividend, row.etf.marketId, mctx);
            if (!deadline) continue;
            const dLeft = daysUntil(deadline.deadlineKST, today);
            const kind: AlertKind | null =
                dLeft === 3 ? "D3" : dLeft === 1 ? "D1" : null;
            if (!kind) continue;

            const watchers = watchRows.filter(
                (w: any) =>
                    w.etfId === row.etf.id &&
                    (kind === "D3" ? w.notifyD3 : w.notifyD1),
            );

            for (const w of watchers) {
                const dup = await db
                    .select()
                    .from(notificationLogs)
                    .where(
                        and(
                            eq(notificationLogs.dividendId, row.dividend.id),
                            eq(notificationLogs.userId, w.userId),
                            eq(notificationLogs.kind, kind),
                        ),
                    )
                    .limit(1);
                if (dup.length > 0) continue;

                const to = emailByUserId.get(w.userId);
                if (!to) {
                    console.warn(`[alerts] ${kind} skip: no email user=${w.userId}`);
                    continue;
                }

                let delivered = false;
                if (resendKey) {
                    try {
                        const r = await sendEmailViaResend(resendKey, fromEmail, {
                            to,
                            kind,
                            ticker: row.etf.ticker,
                            etfName: row.etf.name,
                            deadlineKST: deadline.deadlineKST,
                            appUrl,
                        });
                        delivered = r.ok;
                        if (!r.ok) {
                            console.warn(
                                `[alerts] Resend HTTP ${r.status} user=${w.userId} ${row.etf.ticker}`,
                            );
                        }
                    } catch (err) {
                        console.warn(
                            `[alerts] Resend 발송 실패 user=${w.userId} ${row.etf.ticker}:`,
                            err,
                        );
                    }
                } else {
                    console.log(
                        `[alerts] (dry-run, RESEND_API_KEY 미설정) ${kind} → ${to} ${row.etf.ticker} 마감 ${deadline.deadlineKST}`,
                    );
                    delivered = true; // 키 없는 환경에서도 로그 기록은 진행 (테스트)
                }

                if (delivered) {
                    await db.insert(notificationLogs).values({
                        dividendId: row.dividend.id,
                        kind,
                        userId: w.userId,
                    });
                    sent++;
                } else {
                    failed++;
                }
            }
        }
        return { sent, failed };
    },
});
