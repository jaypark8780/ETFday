import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 로컬 dev는 클라우드 백엔드를 프록시로 중계 → 브라우저는 same-origin /api 호출(CORS 없음).
// 프로덕션은 프론트를 gencow.app에 정적 배포 → 동일하게 상대경로 /api로 same-origin.
const BACKEND = process.env.VITE_BACKEND_URL ?? "https://near-bone-8206.gencow.app";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        port: 5173,
        proxy: {
            "/api": { target: BACKEND, changeOrigin: true, ws: true },
        },
    },
});
