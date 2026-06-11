/**
 * gencow/lib/deadline.ts — 매수마감 계산 모듈 (순수 함수, DB 의존 없음)
 *
 * 규칙 (기획서 §2):
 *   매수마감일 = 배당락일 직전 "해당 시장" 거래일 (주말·휴장일 스킵)
 *   배당락일이 없으면 기준일에서 역산: ex = recordDate - (settlementDays - 1) 거래일
 *
 *   🇺🇸 미국(T+1): 마감 시각 = 매수마감일 16:00 ET
 *               = 한국시간 다음날 05:00(서머타임) / 06:00(표준시)
 *   🇰🇷 한국(T+2): 마감 시각 = 매수마감일 15:30 KST
 *
 * 날짜는 모두 "YYYY-MM-DD" 문자열로 다룬다 (타임존 사고 방지).
 */

export interface MarketRule {
    id: string; // "KR" | "US"
    settlementDays: number; // KR=2, US=1
    closeTime: string; // "15:30" | "16:00"
}

export interface DeadlineResult {
    /** 배당락일 (해당 시장 현지 날짜) */
    exDate: string;
    /** 마지막 매수일 (해당 시장 현지 날짜) */
    lastBuyDate: string;
    /** 매수마감 시각 — KST 기준 ISO 8601 (+09:00) */
    deadlineKST: string;
    /** 계산 근거 (UI "어떻게 계산했나요?" 아코디언용) */
    reason: string[];
}

// ─── 날짜 유틸 ──────────────────────────────────────────────

/** "YYYY-MM-DD" → Date (UTC 정오 고정: 타임존에 의한 날짜 밀림 방지) */
function toDate(s: string): Date {
    return new Date(`${s}T12:00:00Z`);
}

function fmt(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function addDays(s: string, n: number): string {
    const d = toDate(s);
    d.setUTCDate(d.getUTCDate() + n);
    return fmt(d);
}

/** 0=일 ... 6=토 */
function dayOfWeek(s: string): number {
    return toDate(s).getUTCDay();
}

function isWeekend(s: string): boolean {
    const dow = dayOfWeek(s);
    return dow === 0 || dow === 6;
}

export function isTradingDay(s: string, holidays: ReadonlySet<string>): boolean {
    return !isWeekend(s) && !holidays.has(s);
}

/** date 포함, 과거 방향으로 가장 가까운 거래일 */
export function nearestTradingDayOnOrBefore(
    s: string,
    holidays: ReadonlySet<string>,
): string {
    let d = s;
    while (!isTradingDay(d, holidays)) d = addDays(d, -1);
    return d;
}

/** n 거래일 전 (주말·휴장일 스킵). n=0이면 date 자신(거래일 보정). */
export function subtractTradingDays(
    s: string,
    n: number,
    holidays: ReadonlySet<string>,
): string {
    let d = nearestTradingDayOnOrBefore(s, holidays);
    for (let i = 0; i < n; i++) {
        d = addDays(d, -1);
        d = nearestTradingDayOnOrBefore(d, holidays);
    }
    return d;
}

// ─── 미국 서머타임(DST) 판정 ─────────────────────────────────
// DST: 3월 둘째 일요일 ~ 11월 첫째 일요일 (현지 02:00 전환)
// 장 마감(16:00) 기준 판정이므로 날짜 단위 판정으로 충분.

function nthSundayOfMonth(year: number, month: number, nth: number): string {
    // month: 1~12
    const first = new Date(Date.UTC(year, month - 1, 1, 12));
    const firstSundayDate = 1 + ((7 - first.getUTCDay()) % 7);
    const d = new Date(Date.UTC(year, month - 1, firstSundayDate + (nth - 1) * 7, 12));
    return fmt(d);
}

export function isUsDst(s: string): boolean {
    const year = toDate(s).getUTCFullYear();
    const dstStart = nthSundayOfMonth(year, 3, 2); // 3월 둘째 일요일
    const dstEnd = nthSundayOfMonth(year, 11, 1); // 11월 첫째 일요일
    return s >= dstStart && s < dstEnd;
}

// ─── 핵심: 매수마감 계산 ─────────────────────────────────────

export function getBuyDeadline(
    dividend: { exDate?: string | null; recordDate?: string | null },
    market: MarketRule,
    holidays: ReadonlySet<string>,
): DeadlineResult {
    const reason: string[] = [];

    // 1. 배당락일 확정
    let exDate: string;
    if (dividend.exDate) {
        exDate = dividend.exDate;
        reason.push(`배당락일 ${exDate} (공시 기준)`);
    } else if (dividend.recordDate) {
        exDate = subtractTradingDays(
            dividend.recordDate,
            market.settlementDays - 1,
            holidays,
        );
        reason.push(
            `기준일 ${dividend.recordDate} → T+${market.settlementDays} 결제 기준 배당락일 ${exDate} 역산`,
        );
    } else {
        throw new Error("exDate 또는 recordDate 중 하나는 필요합니다");
    }

    // 2. 마지막 매수일 = 배당락일 직전 거래일
    const lastBuyDate = subtractTradingDays(exDate, 1, holidays);
    const calendarPrev = addDays(exDate, -1);
    if (lastBuyDate !== calendarPrev) {
        reason.push(`주말·휴장일로 마지막 매수일이 ${lastBuyDate}로 앞당겨짐`);
    } else {
        reason.push(`마지막 매수일 ${lastBuyDate} (배당락일 전 거래일)`);
    }

    // 3. KST 마감 시각 환산
    let deadlineKST: string;
    if (market.id === "US") {
        const dst = isUsDst(lastBuyDate);
        const kstHour = dst ? "05" : "06"; // 16:00 ET = KST 익일 05시(EDT)/06시(EST)
        const kstDate = addDays(lastBuyDate, 1);
        deadlineKST = `${kstDate}T${kstHour}:00:00+09:00`;
        reason.push(
            `미국장 마감 ${lastBuyDate} 16:00 ET = 한국시간 ${kstDate} ${kstHour}:00 (${dst ? "서머타임" : "표준시"})`,
        );
    } else {
        deadlineKST = `${lastBuyDate}T${market.closeTime}:00+09:00`;
        reason.push(`한국장 정규장 마감 ${lastBuyDate} ${market.closeTime} KST`);
    }

    return { exDate, lastBuyDate, deadlineKST, reason };
}
