import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from "react-router-dom";
import { GencowProvider } from "@gencow/react";
import { API_URL, useAuth } from "./lib/auth";
import Home from "./pages/Home";
import Search from "./pages/Search";
import EtfDetail from "./pages/EtfDetail";
import Calendar from "./pages/Calendar";
import Watchlist from "./pages/Watchlist";

const TABS = [
    { to: "/", icon: "🏠", label: "홈" },
    { to: "/calendar", icon: "📅", label: "캘린더" },
    { to: "/watchlist", icon: "⭐", label: "관심" },
] as const;

function Shell() {
    const location = useLocation();
    const hideHeader = location.pathname === "/search";

    return (
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
            {!hideHeader && (
                <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
                    <Link to="/" className="text-lg font-extrabold text-blue-600">
                        ETFday
                    </Link>
                    <span className="text-xs text-gray-400">언제까지 사야 배당 받을까?</span>
                </header>
            )}

            <main className="flex-1 px-4 py-4 pb-24">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/etf/:ticker" element={<EtfDetail />} />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/watchlist" element={<Watchlist />} />
                </Routes>
            </main>

            <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto flex max-w-lg">
                    {TABS.map((tab) => (
                        <NavLink
                            key={tab.to}
                            to={tab.to}
                            className={({ isActive }) =>
                                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                                    isActive ? "font-bold text-blue-600" : "text-gray-400"
                                }`
                            }
                        >
                            <span className="text-lg leading-none">{tab.icon}</span>
                            {tab.label}
                        </NavLink>
                    ))}
                </div>
            </nav>
        </div>
    );
}

function Providers() {
    const { token } = useAuth();
    return (
        <GencowProvider baseUrl={API_URL} token={token ?? null}>
            <BrowserRouter>
                <Shell />
            </BrowserRouter>
        </GencowProvider>
    );
}

export default function App() {
    return <Providers />;
}
