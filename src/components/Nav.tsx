import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth, signOut } from "../lib/auth";

const NAV_TABS = [
    { to: "/", label: "홈" },
    { to: "/calendar", label: "캘린더" },
    { to: "/watchlist", label: "관심" },
] as const;

export default function DesktopNav() {
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();
    return (
        <header className="hidden lg:block sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-4xl items-center gap-6 px-8 py-3">
                <Link to="/" className="shrink-0 text-lg font-extrabold text-blue-600">
                    ETFday
                </Link>
                <nav className="flex items-center gap-1" aria-label="주 내비게이션">
                    {NAV_TABS.map((t) => (
                        <NavLink
                            key={t.to}
                            to={t.to}
                            end={t.to === "/"}
                            className={({ isActive }) =>
                                `rounded-lg px-3 py-2 text-sm font-medium transition ${
                                    isActive
                                        ? "bg-blue-50 text-blue-600"
                                        : "text-gray-600 hover:bg-gray-100"
                                }`
                            }
                        >
                            {t.label}
                        </NavLink>
                    ))}
                </nav>
                <div className="ml-auto flex items-center gap-3">
                    <button
                        onClick={() => navigate("/search")}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        🔍 검색
                    </button>
                    {isAuthenticated ? (
                        <button
                            onClick={() => signOut()}
                            className="rounded text-sm text-gray-400 transition hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            로그아웃
                        </button>
                    ) : (
                        <NavLink
                            to="/watchlist"
                            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                            로그인
                        </NavLink>
                    )}
                </div>
            </div>
        </header>
    );
}
