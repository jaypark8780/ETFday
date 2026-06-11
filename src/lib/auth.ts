import { createAuthClient } from "@gencow/react";

// 백엔드는 항상 gencow.app 클라우드 (아키텍처 원칙)
// .env의 VITE_API_URL이 있으면 사용, 없어도 클라우드 앱으로 연결
export const API_URL =
    (import.meta as any).env?.VITE_API_URL ?? "https://near-bone-8206.gencow.app";

export const { signIn, signUp, signOut, useAuth } = createAuthClient(API_URL);
