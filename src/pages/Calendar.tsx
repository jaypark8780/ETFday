import { useMemo, useState } from "react";
import { useQuery } from "@gencow/react";
import { api } from "../gencow/api";
import { EtfCard, EmptyState, type UpcomingItem } from "../components/common";
import { formatDateKR } from "../lib/format";

const DAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"];

function todayKSTStr(): string {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function Calendar() {
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const [year, setYear] = useState(now.getUTCFullYear());
    const [month, setMonth] = useState(now.getUTCMonth() + 1);
    const [market, setMarket] = useState("");
    const [selected, setSelected] = useState<string | null>(null);

    const { data, isLoading } = useQuery(
        api.dividends.calendarMonth,
        { year, month, market: market || undefined },
        { public: true },
    );
    const events = ((data as any)?.events ?? []) as UpcomingItem[];
    const holidays = ((data as any)?.holidays ?? []) as {
        date: string;
        name?: string;
        marketId: string;
    }[];

    const move = (delta: number) => {
        let m = month + delta;
        let y = year;
        if (m < 1) (m = 12), y--;
        if (m > 12) (m = 1), y++;
        setYear(y);
        setMonth(m);
        setSelected(null);
    };

    // 날짜별 이벤트 매핑
    const byDate = useMemo(() => {
        const map = new Map<string, { buy: UpcomingItem[]; ex: UpcomingItem[] }>();
        const ensure = (d: string) => {
            if (!map.has(d)) map.set(d, { buy: [], ex: [] });
            return map.get(d)!;
        };
        for (const e of events) {
            ensure(e.lastBuyDate).buy.push(e);
            const exDate = (e as any).dividend?.exDate;
            if (exDate) ensure(exDate).ex.push(e);
        }
        return map;
    }, [events]);

    const holidayMap = useMemo(() => {
        const m = new Map<string, string>();
        for (const h of holidays)
            m.set(h.date, m.has(h.date) ? `${m.get(h.date)} · ${h.name}` : (h.name ?? "휴장"));
        return m;
    }, [holidays]);

    // 달력 그리드 (월요일 시작)
    const cells = useMemo(() => {
        const mm = String(month).padStart(2, "0");
        const first = new Date(`${year}-${mm}-01T12:00:00Z`);
        const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
        const lead = (first.getUTCDay() + 6) % 7; // 월=0
        const arr: (string | null)[] = Array(lead).fill(null);
        for (let d = 1; d <= lastDay; d++)
            arr.push(`${year}-${mm}-${String(d).padStart(2, "0")}`);
        while (arr.length % 7 !== 0) arr.push(null);
        return arr;
    }, [year, month]);

    const today = todayKSTStr();
    const selectedData = selected ? byDate.get(selected) : null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <button onClick={() => move(-1)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5">◀</button>
                <h1 className="text-lg font-bold tabular">{year}년 {month}월</h1>
                <button onClick={() => move(1)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5">▶</button>
            </div>

            <div className="flex gap-2 text-sm">
                {[["", "전체"], ["KR", "🇰🇷 한국"], ["US", "🇺🇸 미국"]].map(([v, label]) => (
                    <button
                        key={v}
                        onClick={() => setMarket(v)}
                        className={`rounded-full px-3 py-1 font-medium ${
                            market === v ? "bg-blue-600 text-white" : "border border-gray-300 bg-white text-gray-600"
                        }`}
                    >
                        {label}
                    </button>
                ))}
                <span className="ml-auto self-center text-xs text-gray-500">★마감 ●배당락 ▨휴장</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="grid grid-cols-7 border-b border-gray-100 text-center text-xs font-medium text-gray-500">
                    {DAY_HEADERS.map((d) => (
                        <div key={d} className="py-2">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {cells.map((date, i) => {
                        if (!date) return <div key={i} className="aspect-square" />;
                        const ev = byDate.get(date);
                        const holiday = holidayMap.get(date);
                        const isToday = date === today;
                        const isPast = date < today;
                        return (
                            <button
                                key={date}
                                onClick={() => setSelected(date)}
                                className={`relative aspect-square lg:min-h-24 border border-gray-50 p-1 text-left text-xs transition ${
                                    holiday ? "bg-gray-100" : ""
                                } ${selected === date ? "ring-2 ring-blue-500 ring-inset" : ""} ${
                                    isPast ? "opacity-40" : ""
                                }`}
                                title={holiday}
                            >
                                <span
                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full tabular ${
                                        isToday ? "bg-blue-600 font-bold text-white" : ""
                                    }`}
                                >
                                    {Number(date.slice(8))}
                                </span>
                                <div className="absolute bottom-1 left-1 flex gap-0.5">
                                    {ev && ev.buy.length > 0 && <span className="text-yellow-600">★</span>}
                                    {ev && ev.ex.length > 0 && <span className="text-blue-500">●</span>}
                                    {holiday && <span className="text-gray-400">▨</span>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {isLoading && <p className="py-4 text-center text-sm text-gray-400">불러오는 중…</p>}

            {selected && (
                <section className="lg:mt-6">
                    <h2 className="mb-2 text-sm font-semibold text-gray-700">
                        {formatDateKR(selected)}
                        {holidayMap.has(selected) && (
                            <span className="ml-2 text-gray-500">▨ {holidayMap.get(selected)}</span>
                        )}
                    </h2>
                    {selectedData && selectedData.buy.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-xs font-medium text-yellow-700">★ 이날이 매수 마감</p>
                            {selectedData.buy.map((e) => (
                                <EtfCard key={`b-${e.etf.id}-${e.deadlineKST}`} item={e} />
                            ))}
                        </div>
                    ) : selectedData && selectedData.ex.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-xs font-medium text-blue-700">● 이날이 배당락일 (매수는 이미 마감)</p>
                            {selectedData.ex.map((e) => (
                                <EtfCard key={`e-${e.etf.id}-${e.deadlineKST}`} item={e} />
                            ))}
                        </div>
                    ) : (
                        <p className="py-4 text-sm text-gray-400">이날은 배당 일정이 없어요</p>
                    )}
                </section>
            )}

            {!isLoading && events.length === 0 && (
                <EmptyState icon="🗓️" title="이번 달 배당 일정이 없어요" />
            )}
        </div>
    );
}
