/**
 * gencow/lib/us-free.ts — 미국 ETF 무료 데이터 소스 (API 키 불필요)
 *
 *  ① Nasdaq 스크리너  — 전체 미국 ETF 목록(~4,500종): 검색용 마스터
 *  ② Nasdaq 배당 API  — 티커별 배당: ex/기준/지급일 + 금액 + 배당률,
 *                       선언된 미래 일정 포함 (무료 소스 중 데이터 최상)
 *  ③ Yahoo chart      — 폴백: 과거 배당락일 + 금액만
 *  ④ FMP stable       — 최후 폴백 (FMP_API_KEY 필요, 무료플랜은 ETF 402)
 *
 * 모두 비공식 API ⚠️ — 차단 가능성이 있으므로 호출부는 반드시
 * 소스 체인(Nasdaq → Yahoo → FMP) 폴백으로 감쌀 것.
 */

const BROWSER_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const NASDAQ_HEADERS = {
    "User-Agent": BROWSER_UA,
    Accept: "application/json, text/plain, */*",
};

export type UsEtfListing = { ticker: string; name: string };

export type UsDividendRow = {
    exDate: string; // YYYY-MM-DD
    recordDate: string | null;
    payDate: string | null;
    amount: number;
};

/** "03/23/2026" → "2026-03-23", 그 외("N/A", 빈 값) → null */
export function usDateToIso(v: string | undefined | null): string | null {
    if (!v) return null;
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/** "$0.73282" / "0.41%" → 숫자, 그 외 → null */
function toNumber(v: string | number | undefined | null): number | null {
    if (v == null) return null;
    const n = Number(String(v).replace(/[$,%\s]/g, ""));
    return Number.isFinite(n) ? n : null;
}

/** ① Nasdaq ETF 스크리너 — 전체 목록 한 번에 (download=true) */
export async function fetchNasdaqEtfList(
    fetchFn: typeof fetch = fetch,
): Promise<UsEtfListing[]> {
    const res = await fetchFn(
        "https://api.nasdaq.com/api/screener/etf?download=true",
        { headers: NASDAQ_HEADERS },
    );
    if (!res.ok) throw new Error(`nasdaq screener HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const rows: any[] = body?.data?.data?.rows ?? body?.data?.rows ?? [];
    return rows
        .map((r) => ({
            ticker: String(r.symbol ?? "").trim().toUpperCase(),
            name: String(r.companyName ?? "").trim(),
        }))
        // 워런트/단위·특수기호 티커 제외 — 일반 ETF 티커는 알파벳 1~5자
        .filter((r) => /^[A-Z]{1,5}$/.test(r.ticker) && r.name.length > 0);
}

/** ② Nasdaq 티커별 배당 — 미래 선언분 포함, 기준/지급일 제공 */
export async function fetchNasdaqDividends(
    ticker: string,
    fetchFn: typeof fetch = fetch,
): Promise<{ rows: UsDividendRow[]; yieldPct: number | null }> {
    const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/dividends?assetclass=etf`;
    const res = await fetchFn(url, { headers: NASDAQ_HEADERS });
    if (!res.ok) throw new Error(`nasdaq dividends HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const raw: any[] = body?.data?.dividends?.rows ?? [];
    const rows = raw
        .map((r) => {
            const exDate = usDateToIso(r.exOrEffDate);
            const amount = toNumber(r.amount);
            if (!exDate || amount == null) return null;
            return {
                exDate,
                recordDate: usDateToIso(r.recordDate),
                payDate: usDateToIso(r.paymentDate),
                amount,
            };
        })
        .filter((r): r is UsDividendRow => r !== null)
        .sort((a, b) => a.exDate.localeCompare(b.exDate));
    return { rows, yieldPct: toNumber(body?.data?.yield) };
}

/** ③ Yahoo v8 chart events.dividends — 과거 이력 폴백 (exDate+amount만) */
export async function fetchYahooDividends(
    ticker: string,
    fetchFn: typeof fetch = fetch,
): Promise<UsDividendRow[]> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=1mo&events=div`;
    const res = await fetchFn(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) throw new Error(`yahoo HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const divs = body?.chart?.result?.[0]?.events?.dividends ?? {};
    return Object.values(divs as Record<string, { amount: number; date: number }>)
        .filter((d) => d?.date != null && d?.amount != null)
        // unix초는 미국장 개장시각(ET 오전) → UTC 변환해도 같은 달력 날짜
        .map((d) => ({
            exDate: new Date(d.date * 1000).toISOString().slice(0, 10),
            recordDate: null,
            payDate: null,
            amount: d.amount,
        }))
        .sort((a, b) => a.exDate.localeCompare(b.exDate));
}

/** ④ FMP stable — 키 있을 때 최후 폴백 (플랫 배열, 빈 날짜는 "") */
export async function fetchFmpDividends(
    ticker: string,
    apiKey: string,
    fetchFn: typeof fetch = fetch,
): Promise<UsDividendRow[]> {
    const url = `https://financialmodelingprep.com/stable/dividends?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`fmp HTTP ${res.status}`);
    const body = (await res.json()) as any;
    if (!Array.isArray(body)) throw new Error("fmp unexpected body");
    return body
        .map((r: any) => {
            const amount = r.adjDividend ?? r.dividend;
            if (!r.date || amount == null) return null;
            return {
                exDate: r.date as string,
                recordDate: r.recordDate?.length ? (r.recordDate as string) : null,
                payDate: r.paymentDate?.length ? (r.paymentDate as string) : null,
                amount: Number(amount),
            };
        })
        .filter((r): r is UsDividendRow => r !== null)
        .sort((a, b) => a.exDate.localeCompare(b.exDate));
}

/** 배당락일 간격 중앙값으로 배당주기 추정 (3회 미만이면 null) */
export function inferFrequency(exDates: string[]): string | null {
    if (exDates.length < 3) return null;
    const sorted = [...exDates].sort();
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const ms =
            new Date(`${sorted[i]}T12:00:00Z`).getTime() -
            new Date(`${sorted[i - 1]}T12:00:00Z`).getTime();
        gaps.push(ms / 86400_000);
    }
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    if (median < 45) return "monthly";
    if (median < 135) return "quarterly";
    if (median < 250) return "semiannual";
    return "annual";
}
