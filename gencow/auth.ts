/**
 * gencow/auth.ts
 *
 * Auth 설정 파일. 이 파일을 수정하여 인증 동작을 커스터마이즈할 수 있습니다.
 * shadcn처럼 이 파일은 사용자가 소유합니다 — 자유롭게 수정하세요.
 *
 * @example Email Verification 활성화:
 *   1. `bun add resend`
 *   2. 아래 emailVerification 블록 주석 해제
 *   3. `gencow env set RESEND_API_KEY re_xxxx`
 *
 * @see https://docs.gencow.com/auth
 */
import { defineAuth } from "@gencow/core";

export default defineAuth({
  // ── Custom User Fields (선택) ──────────────────────
  // `gencow codegen`이 이 설정을 읽어 gencow/auth-schema.ts를 재생성합니다.
  // role 같은 app-owned 필드는 기본적으로 signup input에서 받을 수 없습니다.
  //
  // user: {
  //     additionalFields: {
  //         role: { type: "text", default: "user" },
  //     },
  // },
  //
  // ── better-auth Plugins / Options (선택) ───────────────
  // better-auth 플러그인을 추가하면 `gencow codegen`이 플러그인 스키마까지 반영합니다.
  //
  // betterAuth: (defaults) => ({
  //     ...defaults,
  //     plugins: [
  //         ...((defaults.plugins as unknown[]) ?? []),
  //         // better-auth plugin instances
  //     ],
  // }),
  // ── Email Verification (선택) ──────────────────────
  // 아래 주석을 해제하면 가입 시 이메일 인증이 활성화됩니다.
  //
  // emailVerification: {
  //     sendVerificationEmail: async ({ user, url }) => {
  //         const { Resend } = await import("resend");
  //         const resend = new Resend(process.env.RESEND_API_KEY);
  //         await resend.emails.send({
  //             from: "noreply@yourapp.com",
  //             to: user.email,
  //             subject: "이메일 인증",
  //             html: `<a href="${url}">인증하기</a>`,
  //         });
  //     },
  // },
  // ── Social Login (선택) ────────────────────────────
  // OAuth provider dashboard에는 backend callback URL을 등록하세요:
  // https://your-app.gencow.app/api/auth/callback/google
  // Frontend와 backend 도메인이 다르면 APP_PUBLIC_DOMAIN=your-frontend.com 또는 oauth.callbackURL도 설정하세요.
  //
  // oauth: {
  //   callbackURL: "https://your-frontend.com/auth/callback",
  //   allowedCallbackURLs: ["http://localhost:3000/auth/callback"],
  // },
  //
  // socialProviders: {
  //   google: {
  //     clientId: process.env.GOOGLE_CLIENT_ID!,
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  //   },
  //   apple: {
  //     clientId: process.env.APPLE_CLIENT_ID!,
  //     clientSecret: process.env.APPLE_CLIENT_SECRET!,
  //   },
  //   // Kakao/Naver endpoint URLs and profile mappers are built in.
  //   // You can override authorizationUrl/tokenUrl/userInfoUrl/scopes/mapProfileToUser if needed.
  //   kakao: {
  //     clientId: process.env.KAKAO_CLIENT_ID!,
  //     clientSecret: process.env.KAKAO_CLIENT_SECRET!,
  //   },
  //   naver: {
  //     clientId: process.env.NAVER_CLIENT_ID!,
  //     clientSecret: process.env.NAVER_CLIENT_SECRET!,
  //   },
  // },
});
