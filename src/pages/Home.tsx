import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@gencow/react";
import { api } from "../gencow/api";
import {
    EtfCard,
    CardSkeleton,
    EmptyState,
    type UpcomingItem,
} from "../components/common";
import { daysLeft } from "../lib/format";

const FILTERS = [
    { value: "", label: "전체" },
    { value: "KR", label: "🇰🇷 한국" },
    { value: "US", label: "🇺🇸 미국" },
] as const;

export default function Home() {
    const [market, setMarket] = useState<string>(
        () => localStorage.getItem("marketFilter") ?? "",
    );
    const { data, isLoading } = useQuery(
        api.dividends.upcoming,
        { market: market || undefined, limit: 30 },
        { public: true },
    );
    const items = (data ?? []) as UpcomingItem[];

    const todayItems = items.filter((i) => daysLeft(i.deadlineKST) <= 0);
    const weekItems = items.filter((i) => {
        const d = daysLeft(i.deadlineKST);
        return d > 0 && d <= 7;
    });
    const laterItems = items.filter((i) => daysLeft(i.deadlineKST) > 7);

    const setFilter = (v: string) => {
        setMarket(v);
        localStorage.setItem("marketFilter", v);
    };

    return (
        <div className="space-y-5">
            <Link
                to="/search"
                className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-400"
            >
                🔍 <span>ETF 이름·티커 검색</span>
            </Link>

            <div className="flex gap-2">
                {FILTERS.map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setFilter(f.value)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                            market === f.value
                                ? "bg-blue-600 text-white"
                                : "bg-white text-gray-600 border border-gray-300"
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {isLoading && (
                <div className="grid gap-3 lg:grid-cols-2">
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
            )}

            {!isLoading && todayItems.length > 0 && (
                <section>
                    <h2 className="mb-2 font-bold text-red-600">⏰ 오늘 마감</h2>
                    <div className="grid gap-3 lg:grid-cols-2">
                        {todayItems.map((i) => (
                            <EtfCard key={`${i.etf.id}-${i.deadlineKST}`} item={i} />
                        ))}
                    </div>
                </section>
            )}

            {!isLoading && weekItems.length > 0 && (
                <section>
                    <h2 className="mb-2 font-bold text-gray-800">📌 이번 주 마감</h2>
                    <div className="grid gap-3 lg:grid-cols-2">
                        {weekItems.map((i) => (
                            <EtfCard key={`${i.etf.id}-${i.deadlineKST}`} item={i} />
                        ))}
                    </div>
                </section>
            )}

            {!isLoading && laterItems.length > 0 && (
                <section>
                    <h2 className="mb-2 font-bold text-gray-800">다가오는 마감</h2>
                    <div className="grid gap-3 lg:grid-cols-2">
                        {laterItems.map((i) => (
                            <EtfCard key={`${i.etf.id}-${i.deadlineKST}`} item={i} />
                        ))}
                    </div>
                </section>
            )}

            {!isLoading && items.length === 0 && (
                <EmptyState
                    icon="📭"
                    title="다가오는 마감 일정이 없어요"
                    sub="캘린더에서 이후 일정을 확인해보세요"
                />
            )}
        </div>
    );
}
