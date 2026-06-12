import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@gencow/react";
import { api } from "../gencow/api";
import { useAuth } from "../lib/auth";
import {
    MarketBadge,
    EstimatedBadge,
    Disclaimer,
    EmptyState,
    CardSkeleton,
} from "../components/common";
import {
    daysLeft,
    ddayLabel,
    formatDateKR,
    formatDeadlineKR,
    formatAmount,
    remainingLabel,
    FREQUENCY_LABEL,
} from "../lib/format";

function urgencyBg(days: number): string {
    if (days <= 1) return "bg-red-600";
    if (days <= 3) return "bg-orange-600";
    if (days <= 7) return "bg-yellow-600";
    return "bg-blue-600";
}

function DeadlineHero({ next }: { next: any }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(t);
    }, []);
    const days = daysLeft(next.deadlineKST);
    return (
        <div className={`rounded-2xl p-5 text-white ${urgencyBg(days)}`}>
            <p className="text-center text-3xl font-extrabold tabular lg:text-6xl">{ddayLabel(days)}</p>
            <p className="mt-1 text-center text-sm opacity-90 tabular" aria-live="polite">
                {remainingLabel(next.deadlineKST, now)} 남음
            </p>
            <div className="mt-4 rounded-xl bg-white/15 p-3 text-center">
                <p className="text-xs opacity-80">🇰🇷 한국시간 기준</p>
                <p className="mt-1 text-lg font-bold">
                    {formatDeadlineKR(next.deadlineKST)}까지
                </p>
                <p className="text-sm opacity-90">체결 완료해야 배당을 받아요</p>
            </div>
        </div>
    );
}

function Timeline({ next }: { next: any }) {
    const steps = [
        { label: "매수마감", date: next.lastBuyDate },
        { label: "배당락일", date: next.exDate },
        { label: "기준일", date: next.dividend?.recordDate },
        { label: "지급일", date: next.dividend?.payDate },
    ].filter((s) => s.date);
    return (
        <div className="flex items-start justify-between">
            {steps.map((s, i) => (
                <div key={s.label} className="flex flex-1 flex-col items-center text-center">
                    <div className="flex w-full items-center">
                        <div className={`h-px flex-1 ${i === 0 ? "invisible" : "bg-gray-300"}`} />
                        <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                        <div
                            className={`h-px flex-1 ${i === steps.length - 1 ? "invisible" : "bg-gray-300"}`}
                        />
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-gray-700">{s.label}</p>
                    <p className="text-xs text-gray-500">{formatDateKR(s.date)}</p>
                </div>
            ))}
        </div>
    );
}

export default function EtfDetail() {
    const { ticker } = useParams<{ ticker: string }>();
    const navigate = useNavigate();
    const [showReason, setShowReason] = useState(false);
    const [starred, setStarred] = useState(false);
    const { isAuthenticated } = useAuth();
    const { mutate: addWatch, isPending: adding } = useMutation(api.watchlists.create);

    const onStar = async (etfId: number) => {
        if (!isAuthenticated) {
            navigate("/watchlist"); // 로그인 화면으로
            return;
        }
        // userId·기본값은 서버 crud가 자동 주입
        await addWatch({ etfId } as any);
        setStarred(true);
    };

    const { data, isLoading, refetch } = useQuery(
        api.dividends.detail,
        ticker ? { ticker } : "skip",
        { public: true },
    );
    const detail = data as any;

    // 미국 ETF: 목록엔 있지만 배당 데이터가 없으면 무료 소스에서 온디맨드 동기화
    const { mutate: syncUs } = useMutation(api.sync.usOne);
    const [usSyncing, setUsSyncing] = useState(false);
    const usSyncTried = useRef(false);
    useEffect(() => {
        const d = data as any;
        if (!d || usSyncTried.current) return;
        const noData = !d.next && (d.history?.length ?? 0) === 0;
        if (d.etf?.marketId === "US" && noData) {
            usSyncTried.current = true;
            setUsSyncing(true);
            Promise.resolve(syncUs({ ticker: d.etf.ticker } as any))
                .then(() => refetch?.())
                .finally(() => setUsSyncing(false));
        }
    }, [data, syncUs, refetch]);

    if (isLoading)
        return (
            <div className="space-y-3">
                <CardSkeleton />
                <CardSkeleton />
            </div>
        );
    if (!detail)
        return <EmptyState icon="❓" title="ETF를 찾을 수 없어요" sub={`티커: ${ticker}`} />;

    const { etf, next, history } = detail;

    return (
        <div className="space-y-5 lg:mx-auto lg:max-w-3xl">
            <div className="flex items-center gap-2">
                <button onClick={() => navigate(-1)} className="p-2 text-gray-500">
                    ←
                </button>
                <h1 className="text-xl font-bold">{etf.ticker}</h1>
                <MarketBadge marketId={etf.marketId} />
                <button
                    onClick={() => onStar(etf.id)}
                    disabled={adding || starred}
                    className="ml-auto rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm disabled:opacity-60"
                    title="관심 ETF 등록"
                >
                    {starred ? "⭐ 등록됨" : "☆ 관심"}
                </button>
            </div>

            <div>
                <p className="font-medium text-gray-800">{etf.name}</p>
                <p className="mt-0.5 text-sm text-gray-500">
                    {etf.frequency && (FREQUENCY_LABEL[etf.frequency] ?? etf.frequency)}
                    {etf.dividendYield && ` · 배당률 ${Number(etf.dividendYield).toFixed(2)}%`}
                    {etf.expenseRatio && ` · 보수 ${Number(etf.expenseRatio).toFixed(2)}%`}
                    {etf.issuer && ` · ${etf.issuer}`}
                </p>
            </div>

            {next ? (
                <>
                    <DeadlineHero next={next} />

                    <div className="rounded-xl border border-gray-200 bg-white">
                        <button
                            onClick={() => setShowReason(!showReason)}
                            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
                        >
                            어떻게 계산했나요?
                            <span className="text-gray-400">{showReason ? "▴" : "▾"}</span>
                        </button>
                        {showReason && (
                            <ul className="space-y-1.5 border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
                                {(next.reason ?? []).map((r: string, i: number) => (
                                    <li key={i}>· {r}</li>
                                ))}
                                {next.dividend?.isEstimated && (
                                    <li className="text-violet-600">
                                        · 아직 확정 공시 전 — 운용사 규칙 기반 예상 일정입니다
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>

                    <section className="rounded-xl border border-gray-200 bg-white p-4">
                        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                            일정 타임라인
                            {next.dividend?.isEstimated && <EstimatedBadge />}
                        </h2>
                        <Timeline next={next} />
                    </section>
                </>
            ) : usSyncing ? (
                <EmptyState
                    icon="⏳"
                    title="배당 일정을 불러오는 중…"
                    sub="무료 데이터 소스에서 가져오고 있어요 (수 초)"
                />
            ) : (
                <EmptyState
                    icon="🗓️"
                    title="예정된 배당 일정이 없어요"
                    sub="공시가 나오면 업데이트됩니다"
                />
            )}

            {history?.length > 0 && (
                <section className="rounded-xl border border-gray-200 bg-white p-4">
                    <h2 className="mb-2 text-sm font-semibold text-gray-700">
                        배당 이력 (최근 {history.length}회)
                    </h2>
                    <table className="w-full text-sm">
                        <tbody>
                            {history.map((h: any) => (
                                <tr key={h.id} className="border-t border-gray-100">
                                    <td className="py-2 text-gray-600">{h.exDate && formatDateKR(h.exDate)}</td>
                                    <td className="py-2 text-right font-medium tabular">
                                        {formatAmount(h.amount, h.currency)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            <Disclaimer />
        </div>
    );
}
