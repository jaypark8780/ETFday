/**
 * 매수마감 계산 모듈 테스트 — `bun gencow/lib/deadline.test.ts` 로 실행
 * (외부 프레임워크 없이 node:assert 사용)
 */
import assert from "node:assert/strict";
import {
    getBuyDeadline,
    subtractTradingDays,
    isUsDst,
    type MarketRule,
} from "./deadline";

const US: MarketRule = { id: "US", settlementDays: 1, closeTime: "16:00" };
const KR: MarketRule = { id: "KR", settlementDays: 2, closeTime: "15:30" };
const NONE = new Set<string>();

let passed = 0;
function test(name: string, fn: () => void) {
    fn();
    passed++;
    console.log(`✓ ${name}`);
}

// ─── 거래일 연산 ────────────────────────────────────────────

test("주말 스킵: 월요일의 1거래일 전 = 금요일", () => {
    // 2026-06-22(월) → 2026-06-19(금)
    assert.equal(subtractTradingDays("2026-06-22", 1, NONE), "2026-06-19");
});

test("휴장일 스킵: 금요일이 휴장이면 목요일", () => {
    const holidays = new Set(["2026-06-19"]);
    assert.equal(subtractTradingDays("2026-06-22", 1, holidays), "2026-06-18");
});

test("연속 휴장(설 연휴 가정) + 주말 모두 스킵", () => {
    // 2026-02-16(월)~18(수) 휴장 가정 → 2026-02-19(목)의 1거래일 전 = 2026-02-13(금)
    const holidays = new Set(["2026-02-16", "2026-02-17", "2026-02-18"]);
    assert.equal(subtractTradingDays("2026-02-19", 1, holidays), "2026-02-13");
});

// ─── 미국 DST ──────────────────────────────────────────────

test("DST 판정: 2026년 3월 8일(둘째 일요일)부터 DST", () => {
    assert.equal(isUsDst("2026-03-07"), false);
    assert.equal(isUsDst("2026-03-08"), true);
});

test("DST 판정: 2026년 11월 1일(첫째 일요일)부터 표준시", () => {
    assert.equal(isUsDst("2026-10-31"), true);
    assert.equal(isUsDst("2026-11-01"), false);
});

// ─── 미국 ETF 마감 계산 ─────────────────────────────────────

test("US 기본: 배당락일 수요일 → 마지막 매수일 화요일, KST 익일 새벽 5시(여름)", () => {
    // SCHD 가정: 배당락일 2026-06-24(수)
    const r = getBuyDeadline({ exDate: "2026-06-24" }, US, NONE);
    assert.equal(r.lastBuyDate, "2026-06-23");
    assert.equal(r.deadlineKST, "2026-06-24T05:00:00+09:00");
});

test("US 겨울(표준시): KST 새벽 6시", () => {
    const r = getBuyDeadline({ exDate: "2026-12-16" }, US, NONE); // 수요일
    assert.equal(r.lastBuyDate, "2026-12-15");
    assert.equal(r.deadlineKST, "2026-12-16T06:00:00+09:00");
});

test("US 추수감사절: 휴장일 끼면 마감일 앞당겨짐", () => {
    // 2026-11-26(목) Thanksgiving 휴장. 배당락일 2026-11-27(금)
    const holidays = new Set(["2026-11-26"]);
    const r = getBuyDeadline({ exDate: "2026-11-27" }, US, holidays);
    assert.equal(r.lastBuyDate, "2026-11-25"); // 수요일
    assert.equal(r.deadlineKST, "2026-11-26T06:00:00+09:00"); // 11월 말 = 표준시
    assert.ok(r.reason.some((s) => s.includes("앞당겨짐")));
});

test("US T+1: 기준일만 있으면 배당락일 = 기준일 당일", () => {
    const r = getBuyDeadline({ recordDate: "2026-06-24" }, US, NONE);
    assert.equal(r.exDate, "2026-06-24"); // T+1 → 역산 0거래일
});

// ─── 한국 ETF 마감 계산 ─────────────────────────────────────

test("KR T+2: 지급기준일 화요일 → 분배락일 월요일, 매수마감 금요일 15:30", () => {
    // 지급기준일 2026-06-30(화)
    const r = getBuyDeadline({ recordDate: "2026-06-30" }, KR, NONE);
    assert.equal(r.exDate, "2026-06-29"); // 월요일 (1거래일 역산)
    assert.equal(r.lastBuyDate, "2026-06-26"); // 금요일
    assert.equal(r.deadlineKST, "2026-06-26T15:30:00+09:00");
});

test("KR: 기준일이 주말이면 직전 거래일로 보정 후 계산", () => {
    // 기준일 2026-08-31(월) → 분배락 2026-08-28(금) → 매수마감 2026-08-27(목)
    const r = getBuyDeadline({ recordDate: "2026-08-31" }, KR, NONE);
    assert.equal(r.exDate, "2026-08-28");
    assert.equal(r.lastBuyDate, "2026-08-27");
});

test("KR 휴장 연휴: 기준일 직전 연휴면 매수마감 대폭 앞당겨짐", () => {
    // 기준일 2026-02-19(목), 2/16~18 휴장 → 분배락 2026-02-13(금) → 매수마감 2026-02-12(목)
    const holidays = new Set(["2026-02-16", "2026-02-17", "2026-02-18"]);
    const r = getBuyDeadline({ recordDate: "2026-02-19" }, KR, holidays);
    assert.equal(r.exDate, "2026-02-13");
    assert.equal(r.lastBuyDate, "2026-02-12");
});

// ─── 오류 케이스 ────────────────────────────────────────────

test("exDate·recordDate 둘 다 없으면 예외", () => {
    assert.throws(() => getBuyDeadline({}, US, NONE));
});

console.log(`\n${passed}개 테스트 통과 ✅`);
