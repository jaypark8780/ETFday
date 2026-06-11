/**
 * gencow/crons.ts — 크론 스케줄러 (서버 시간 = UTC, KST = UTC+9)
 *
 * ⚠️ export default crons 필수.
 * ⚠️ action 문자열은 mutation 이름과 정확히 일치해야 함 ({module}.{export}).
 */
import { cronJobs } from "@gencow/core";

const crons = cronJobs();

// 미국 배당 일정 동기화 — 매일 KST 07:00 (UTC 22:00, 미국장 마감 후)
crons.daily("syncUsDividends", { hour: 22, minute: 0 }, "sync.usDividends");

// 미국 ETF 전체 목록 갱신(신규 상장 반영) — 매주 토요일 KST 08:00 (UTC 금 23:00)
crons.weekly("syncUsEtfList", { dayOfWeek: 5, hour: 23 }, "sync.usEtfList");

// 한국 예상 분배 일정 생성 — 매일 KST 18:00 (UTC 09:00, 한국장 마감 후)
crons.daily("syncKrDividends", { hour: 9, minute: 0 }, "sync.krDividends");

// 휴장일 동기화 — 매주 월요일 KST 10:00 (UTC 01:00)
crons.weekly("syncHolidays", { dayOfWeek: 1, hour: 1 }, "sync.holidays");

// D-3/D-1 알림 발송 — 매일 KST 09:00 (UTC 00:00)
crons.daily("sendDailyAlerts", { hour: 0, minute: 0 }, "alerts.sendDaily");

// 배당률 재계산 — 매일 KST 08:00 (UTC 23:00)
crons.daily("refreshYield", { hour: 23, minute: 0 }, "sync.refreshYield");

export default crons;
