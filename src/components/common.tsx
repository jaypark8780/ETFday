import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    daysLeft,
    ddayLabel,
    urgencyClass,
    formatDeadlineKR,
    formatAmount,
    remainingLabel,
    FREQUENCY_LABEL,
} from "../lib/format";

// ─── MarketBadge ────────────────────────────────────────────
export function MarketBadge({ marketId }: { marketId: string }) {
    const isKR = marketId === "KR";
    return (
        <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold ${
                isKR ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
            }`}
        >
            {isKR ? "🇰🇷 한국" : "🇺🇸 미국"}
        </span>
    );
}

// ─── DdayBadge ──────────────────────────────────────────────
export function DdayBadge({ deadlineKST }: { deadlineKST: string }) {
    const days = daysLeft(deadlineKST);
    return (
        <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold tabular ${urgencyClass(days)}`}
        >
            {ddayLabel(days)}
        </span>
    );
}

// ─── EstimatedBadge ─────────────────────────────────────────
export function EstimatedBadge() {
    return (
        <span className="rounded border border-dashed border-violet-400 px-1.5 py-0.5 text-[11px] font-medium text-violet-600">
            예상
        </span>
    );
}

// ─── Countdown (분 단위 갱신) ────────────────────────────────
export function Countdown({ deadlineKST }: { deadlineKST: string }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(t);
    }, []);
    if (new Date(deadlineKST).getTime() <= now)
        return <span className="text-gray-500">마감됨</span>;
    return (
        <span className="tabular" aria-live="polite">
            ⏳ {remainingLabel(deadlineKST, now)} 남음
        </span>
    );
}

// ─── EtfCard ────────────────────────────────────────────────
export interface UpcomingItem {
    etf: {
        id: number;
        ticker: string;
        name: string;
        marketId: string;
        frequency?: string | null;
        dividendYield?: string | null;
    };
    dividend: {
        amount?: string | null;
        currency: string;
        isEstimated?: boolean;
    };
    lastBuyDate: string;
    deadlineKST: string;
    reason?: string[];
}

export function EtfCard({ item }: { item: UpcomingItem }) {
    const days = daysLeft(item.deadlineKST);
    return (
        <Link
            to={`/etf/${item.etf.ticker}`}
            className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-300"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <MarketBadge marketId={item.etf.marketId} />
                        <span className="font-bold">{item.etf.ticker}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-gray-600">{item.etf.name}</p>
                </div>
                <DdayBadge deadlineKST={item.deadlineKST} />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
                <span className={days <= 1 ? "font-semibold text-red-600" : "text-gray-700"}>
                    {formatDeadlineKR(item.deadlineKST)} 마감
                </span>
                {days <= 1 && <Countdown deadlineKST={item.deadlineKST} />}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                <span>배당금 {formatAmount(item.dividend.amount, item.dividend.currency)}</span>
                {item.etf.frequency && <span>· {FREQUENCY_LABEL[item.etf.frequency] ?? item.etf.frequency}</span>}
                {item.dividend.isEstimated && <EstimatedBadge />}
            </div>
        </Link>
    );
}

// ─── Skeleton / EmptyState / Disclaimer ─────────────────────
export function CardSkeleton() {
    return (
        <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-48 rounded bg-gray-100" />
            <div className="mt-3 h-3 w-32 rounded bg-gray-100" />
        </div>
    );
}

export function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
    return (
        <div className="flex flex-col items-center py-16 text-center">
            <div className="text-4xl">{icon}</div>
            <p className="mt-3 font-medium text-gray-700">{title}</p>
            {sub && <p className="mt-1 text-sm text-gray-500">{sub}</p>}
        </div>
    );
}

export function Disclaimer() {
    return (
        <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            ⚠️ 국내 증권사를 통한 미국 주식 주문은 예약주문 처리·결제 지연 가능성이 있어
            마감 직전 매수는 권장하지 않습니다. 본 서비스는 정보 제공 목적이며 투자 결과에
            대한 책임을 지지 않습니다. 일정은 공시에 따라 변경될 수 있습니다.
        </p>
    );
}
