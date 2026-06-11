/** 날짜·마감 표시 유틸 — 항상 KST 기준으로 표기 */

const KST = "Asia/Seoul";
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-06-24" → "6월 24일 (수)" */
export function formatDateKR(dateStr: string): string {
    const [, m, day] = dateStr.split("-").map(Number);
    const dow = DAY_NAMES[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
    return `${m}월 ${day}일 (${dow})`;
}

/** deadlineKST ISO → "6월 24일 (수) 새벽 4:59" / "6월 26일 (금) 15:30" */
export function formatDeadlineKR(iso: string): string {
    const date = iso.slice(0, 10);
    const hour = Number(iso.slice(11, 13));
    const minute = iso.slice(14, 16);
    const base = formatDateKR(date);
    if (hour < 9) {
        // 미국장 마감 (KST 새벽) — "직전까지" 의미로 1분 빼서 표기하지 않고 시각 그대로
        return `${base} 새벽 ${hour}:${minute}`;
    }
    return `${base} ${String(hour).padStart(2, "0")}:${minute}`;
}

/** 마감까지 남은 일수 (KST 날짜 기준, 오늘 마감 = 0) */
export function daysLeft(deadlineISO: string): number {
    const todayKST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const d1 = new Date(`${deadlineISO.slice(0, 10)}T00:00:00Z`).getTime();
    const d0 = new Date(`${todayKST}T00:00:00Z`).getTime();
    return Math.round((d1 - d0) / 86400000);
}

/** 긴급도 → Tailwind 클래스 (배지) */
export function urgencyClass(days: number): string {
    if (days <= 1) return "bg-red-600 text-white";
    if (days <= 3) return "bg-orange-600 text-white";
    if (days <= 7) return "bg-yellow-600 text-white";
    return "bg-gray-200 text-gray-700";
}

export function ddayLabel(days: number): string {
    if (days <= 0) return "오늘 마감";
    return `D-${days}`;
}

/** 남은 시간 "12일 21시간 4분" */
export function remainingLabel(deadlineISO: string, now: number): string {
    let diff = Math.max(0, new Date(deadlineISO).getTime() - now);
    const d = Math.floor(diff / 86400000);
    diff -= d * 86400000;
    const h = Math.floor(diff / 3600000);
    diff -= h * 3600000;
    const m = Math.floor(diff / 60000);
    if (d > 0) return `${d}일 ${h}시간 ${m}분`;
    if (h > 0) return `${h}시간 ${m}분`;
    return `${m}분`;
}

/** 금액 표기 */
export function formatAmount(amount: string | number | null | undefined, currency: string): string {
    if (amount == null) return "미정";
    const n = Number(amount);
    if (Number.isNaN(n)) return "미정";
    return currency === "USD" ? `$${n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}` : `${n.toLocaleString()}원`;
}

export const FREQUENCY_LABEL: Record<string, string> = {
    monthly: "월배당",
    quarterly: "분기배당",
    annual: "연배당",
};
