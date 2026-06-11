export default {
    dialect: "postgresql",
    schema: ["./gencow/schema.ts", "./gencow/auth-schema.ts"],
    out: "./gencow/migrations",
    // _system_*/_gencow_* 테이블은 Gencow 플랫폼 내부 테이블 — drizzle-kit이 무시하도록 필터링
    tablesFilter: [
        "!_system_*",
        "!_gencow_*",
        // 구 테이블 — RLS 정책 이름 충돌로 폐기, drizzle가 건드리지 않도록 제외
        "!watchlists",
        "!notification_logs",
    ],
    // generate는 DB 연결 없이 스키마 파일만 비교하여 SQL 생성.
    // push(로컬 전용)는 DB 연결 필요.
    ...(process.env.DATABASE_URL
        ? { dbCredentials: { url: process.env.DATABASE_URL } }
        : { driver: "pglite", dbCredentials: { url: "./.gencow/data" } }),
};
