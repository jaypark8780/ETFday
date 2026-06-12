import { useState } from "react";
import { useQuery, useMutation } from "@gencow/react";
import { api } from "../gencow/api";
import { signIn, signUp, signOut, useAuth } from "../lib/auth";
import {
    EtfCard,
    EmptyState,
    CardSkeleton,
    type UpcomingItem,
} from "../components/common";

function AuthForm() {
    const [mode, setMode] = useState<"login" | "signup">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            if (mode === "signup") await signUp(email, password, name || email.split("@")[0]);
            else await signIn(email, password);
        } catch (err: any) {
            setError(err?.message ?? "로그인에 실패했어요");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto max-w-sm py-8 text-center">
            <div className="text-4xl">⭐</div>
            <h1 className="mt-3 text-lg font-bold">관심 ETF를 등록하면 마감 전에 알려드려요</h1>
            <form onSubmit={submit} className="mt-6 space-y-3 text-left">
                {mode === "signup" && (
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="이름"
                        className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    />
                )}
                <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="이메일"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
                <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호 (8자 이상)"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                    disabled={busy}
                    className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
                >
                    {busy ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
                </button>
            </form>
            <button
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="mt-4 text-sm text-blue-600"
            >
                {mode === "login" ? "처음이신가요? 회원가입" : "이미 계정이 있어요 → 로그인"}
            </button>
        </div>
    );
}

function MyList() {
    const { user } = useAuth();
    const { data, isLoading } = useQuery(api.watchlists.myUpcoming);
    const { mutate: removeWatch } = useMutation(api.watchlists.remove);
    const items = (data ?? []) as (UpcomingItem & { watchlistId?: number })[];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold">내 관심 ETF {items.length > 0 && `(${items.length})`}</h1>
                <button onClick={() => signOut()} className="text-sm text-gray-400">
                    로그아웃
                </button>
            </div>
            {user?.email && <p className="text-xs text-gray-400">{user.email}</p>}

            {isLoading && (
                <div className="grid gap-3 lg:grid-cols-2">
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
            )}

            {!isLoading && items.length === 0 && (
                <EmptyState
                    icon="⭐"
                    title="아직 관심 ETF가 없어요"
                    sub="ETF 상세 화면에서 ⭐을 눌러 등록하세요"
                />
            )}

            <div className="grid gap-3 lg:grid-cols-2">
                {items.map((item) => (
                    <div key={item.etf.id} className="relative">
                        <EtfCard item={item} />
                        {item.watchlistId != null && (
                            <button
                                onClick={() => removeWatch({ id: item.watchlistId! })}
                                className="absolute right-3 bottom-3 text-xs text-gray-400 hover:text-red-500"
                            >
                                삭제
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function Watchlist() {
    const { isAuthenticated } = useAuth();
    return isAuthenticated ? <MyList /> : <AuthForm />;
}
