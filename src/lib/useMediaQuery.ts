import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(
        () => typeof window !== "undefined" ? window.matchMedia(query).matches : false,
    );
    useEffect(() => {
        const mq = window.matchMedia(query);
        setMatches(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, [query]);
    return matches;
}

export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
