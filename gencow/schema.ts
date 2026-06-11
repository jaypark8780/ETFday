import { registerOwnerRls } from "@gencow/core";
import {
    pgTable,
    text,
    serial,
    integer,
    numeric,
    boolean,
    date,
    timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// ═══════════════════════════════════════════════════════════
// 공용 참조 데이터 (RLS 없음 — 공개 조회용)
// ═══════════════════════════════════════════════════════════

/**
 * 시장 설정 — 결제주기를 데이터로 관리.
 * 한국이 T+1로 전환(2027년경 예정)되면 settlementDays 값만 변경.
 */
export const markets = pgTable("markets", {
    id: text("id").primaryKey(), // "KR" | "US"
    name: text("name").notNull(), // "한국거래소", "NYSE/NASDAQ"
    timezone: text("timezone").notNull(), // "Asia/Seoul", "America/New_York"
    settlementDays: integer("settlement_days").notNull(), // KR=2, US=1
    closeTime: text("close_time").notNull(), // "15:30", "16:00"
});

export const etfs = pgTable("etfs", {
    id: serial("id").primaryKey(),
    ticker: text("ticker").notNull(), // "SCHD", "458730"
    name: text("name").notNull(), // "TIGER 미국배당다우존스"
    marketId: text("market_id")
        .notNull()
        .references(() => markets.id),
    issuer: text("issuer"), // "미래에셋", "Schwab"
    frequency: text("frequency"), // "monthly" | "quarterly" | "annual"
    dividendYield: numeric("dividend_yield"), // 최근 12개월 배당률(%)
    expenseRatio: numeric("expense_ratio"), // 총보수(%)
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dividends = pgTable("dividends", {
    id: serial("id").primaryKey(),
    etfId: integer("etf_id")
        .notNull()
        .references(() => etfs.id, { onDelete: "cascade" }),
    exDate: date("ex_date"), // 배당락일 (없으면 recordDate에서 역산)
    recordDate: date("record_date"), // 기준일/지급기준일
    payDate: date("pay_date"), // 지급일
    amount: numeric("amount"), // 주당 분배금
    currency: text("currency").notNull(), // "KRW" | "USD"
    isEstimated: boolean("is_estimated").default(false).notNull(), // 예상치 여부
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const marketHolidays = pgTable("market_holidays", {
    id: serial("id").primaryKey(),
    marketId: text("market_id")
        .notNull()
        .references(() => markets.id),
    date: date("date").notNull(), // "2026-11-26"
    name: text("name"), // "Thanksgiving", "설날"
});

// ═══════════════════════════════════════════════════════════
// 사용자 데이터 (ownerRls — 사용자별 자동 격리)
// ═══════════════════════════════════════════════════════════

// ⚠️ DB 레벨 RLS 정책은 선언하지 않음 — gencow CLI의 정책 이름 충돌(푸시 실패) 회피.
//    대신 registerOwnerRls()로 앱 레벨 격리(crud의 WHERE userId 자동 주입)는 유지.
export const watchlists = pgTable("watchlist_items", {
    id: serial("id").primaryKey(),
    etfId: integer("etf_id")
        .notNull()
        .references(() => etfs.id, { onDelete: "cascade" }),
    notifyD3: boolean("notify_d3").default(true).notNull(),
    notifyD1: boolean("notify_d1").default(true).notNull(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
registerOwnerRls(watchlists, { columnName: "user_id", readPublic: false });

/** 알림 발송 이력 — 중복 발송 방지용 */
export const notificationLogs = pgTable("alert_logs", {
    id: serial("id").primaryKey(),
    dividendId: integer("dividend_id")
        .notNull()
        .references(() => dividends.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "D3" | "D1"
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
});
registerOwnerRls(notificationLogs, { columnName: "user_id", readPublic: false });
