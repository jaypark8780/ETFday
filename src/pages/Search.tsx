import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@gencow/react";
import { api } from "../gencow/api";
import { MarketBadge, EmptyState } from "../components/common";

const POPULAR = ["SCHD", "JEPI", "JEPQ", "458730"];

export default function Search() {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const [keyword, setKeyword] = useState("");
    const [debounced, setDebounced] = useState("");

    useEffect(() => inputRef.current?.focus(), []);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(keyword.trim()), 200);
        return () => clearTimeout(t);
    }, [keyword]);

    const { data, isLoading } = useQuery(
        api.etfs.list,
        debounced ? { search: debounced, limit: 20 } : "skip",
        { public: true },
    );
    const results = (data as any)?.data ?? [];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <button onClick={() => navigate(-1)} className="p-2 text-gray-500">
                    ←
                </button>
                <input
                    ref={inputRef}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="티커 또는 이름 (예: SCHD, TIGER)"
                    className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
                />
            </div>

            {debounced === "" && (
                <section>
                    <h2 className="mb-2 text-sm font-semibold text-gray-500">인기 ETF</h2>
                    <div className="flex flex-wrap gap-2">
                        {POPULAR.map((t) => (
                            <Link
                                key={t}
                                to={`/etf/${t}`}
                                className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm"
                            >
                                {t}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {debounced !== "" && isLoading && (
                <p className="py-8 text-center text-sm text-gray-400">검색 중…</p>
            )}

            {debounced !== "" && !isLoading && results.length === 0 && (
                <EmptyState
                    icon="🔍"
                    title={`'${debounced}' 검색 결과가 없어요`}
                    sub="티커 또는 종목명을 확인해주세요"
                />
            )}

            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white">
                {results.map((etf: any) => (
                    <li key={etf.id}>
                        <Link
                            to={`/etf/${etf.ticker}`}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                        >
                            <MarketBadge marketId={etf.marketId} />
                            <span className="font-semibold">{etf.ticker}</span>
                            <span className="truncate text-sm text-gray-600">{etf.name}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
