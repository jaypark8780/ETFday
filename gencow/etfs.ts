/**
 * gencow/etfs.ts — ETF 마스터 공개 CRUD
 * 프론트: useQuery(api.etfs.list, { search: "SCHD" })
 */
import { crud } from "@gencow/core";
import { etfs } from "./schema";

export const { list, get } = crud(etfs, {
    public: true, // 비로그인 조회 허용
    methods: ["list", "get"], // 쓰기는 sync 크론/관리자만 (mutation 미노출)
    searchFields: ["ticker", "name"],
    allowedFilters: ["marketId", "frequency", "isActive"],
    defaultLimit: 20,
    maxLimit: 100,
});
