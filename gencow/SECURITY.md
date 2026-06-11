# 🔒 Gencow Security Guide

> 이 문서는 `gencow init`으로 자동 생성됩니다.
> 데이터 격리와 보안을 위한 필수 체크리스트입니다.

---

## 스키마 보안 — PostgreSQL RLS (권장)

Gencow는 데이터베이스 레벨(PostgreSQL Row-Level Security)에서 데이터 격리를 자동으로 강제합니다.
스키마에 `ownerRls`를 한 번 선언하면 이후 모든 CRUD 작업에서 인증된 사용자의 데이터만 조회/수정되도록 보장합니다.

```typescript
import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { ownerRls } from "@gencow/core";
import { user } from "./auth-schema";

// ✅ 권장: ownerRls — PostgreSQL RLS를 통한 자동 격리
export const tasks = pgTable("tasks", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
}, (t) => [ownerRls(t)]);
// → 이후 ctx.db.select().from(tasks) 만으로 안전 (본인 데이터만 노출됨)

// ✅ 공개 테이블 — 인증 불필요
export const categories = pgTable("categories", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
});
// 별도 RLS 정책을 부여하지 않으면 공용 데이터로 취급됩니다.
```

### crud() — 보안 내장 CRUD 팩토리

`crud()`를 사용하면 인증, RLS, 입력 검증이 자동 적용됩니다. **직접 query()/mutation()을 작성하기 전에 항상 crud()를 먼저 고려하세요.**

```typescript
import { crud } from "@gencow/core";
import { tasks } from "./schema";

// ✅ 인증 + RLS + 입력 검증 + realtime 자동 적용
export const { list, get, create, update, remove } = crud(tasks);

// ✅ allowedFilters로 SQL Injection 방지 (화이트리스트 방식)
export const { list } = crud(tasks, {
    allowedFilters: ["status", "category"],
    // → filters에 정의되지 않은 필드는 자동으로 무시됨
    // → filters: { userId: "hacker" } → 무시됨 (userId가 allowedFilters에 없으므로)
});
```

> ⚠️ **crud() 사용 시 테이블에 반드시 `id` 컬럼이 있어야 합니다.**
> `id: serial("id").primaryKey()` 또는 `id: text("id").primaryKey()`

### DB 접근 계층

```typescript
ctx.db         // ✅ 기본 접근. 세션 기반 RLS 정책이 Postgres 레벨에서 자동 적용.
ctx.unsafeDb   // ⚠️ 보안 해제 (Escape Hatch). RLS 정책 무시 및 모든 데이터 조회 가능.

// 예시
ctx.db.select().from(tasks);         // ✅ 현재 사용자의 데이터만 조회 (DBMS 레벨 필터링)
ctx.unsafeDb.select().from(tasks);   // ⚠️ 정책 우회 — 전체 데이터 접근
```

---

## Query 보안 — 자동 격리

RLS를 사용하면 query 구현 시 `.where(eq(tasks.userId, user.id))` 같은 별도의 보안 수동 코딩이 필요 없습니다. Drizzle 쿼리가 DB에 도달할 때 `app.current_user_id`를 기반으로 자동화됩니다.

```typescript
// ✅ RLS 사용 시 — 코드가 간결해지고 보안 누수가 방지됨
export const list = query("tasks.list", {
    handler: async (ctx) => {
        return ctx.db.select().from(tasks);
        // → RLS 프로비저닝에 의해 알아서 본인 데이터만 반환
    }
});
```

### ⛔ unsafeDb 직접 사용 지양

> **관리자 권한 앱이나 시스템 백그라운드 작업이 아닌 이상 `ctx.unsafeDb` 사용을 삼가세요.**
> 일반적인 웹 앱 논리에서는 `ctx.db` 만으로 모두 처리가 가능해야 정상적인 설계입니다.
>
> `public: true` query/mutation/httpAction 안에서 `ctx.unsafeDb`, `rawSql`, `SQL.unsafe`, `client.unsafe`를 사용하면 `gencow deploy`가 차단합니다. 예외가 필요하면 직전 주석에 `gencow-allow-unsafe-db reason: ... scope: ... owner: ... test: ...`를 모두 남겨야 합니다.

## Workflow 보안 — owner-scoped 조회 유지

`workflow()` 런타임은 `_gencow_workflows`, `_gencow_workflow_steps`, `_gencow_workflow_events`에 저장됩니다. 이 테이블들은 플랫폼 내부 상태이므로 앱 스키마나 공개 API처럼 다루면 안 됩니다.

```typescript
// ✅ 권장: exact-id workflow inspection
const state = useWorkflow(api.workflows.get, run.id);

// ✅ 커스텀 목록이 필요하면 인증 + owner filter
export const runs = query("workflowSmoke.runs", {
    handler: async (ctx) => {
        const user = ctx.auth.requireAuth();
        // gencow-allow-unsafe-db reason: workflow list scope: owner rows only owner: app-team test: workflow-runs-auth
        return ctx.unsafeDb.execute(sql`
            select * from _gencow_workflows
            where user_id = ${user.id}
            order by started_at desc
            limit 20
        `);
    },
});

// ❌ 금지: public + unsafeDb + 무필터 workflow 목록
export const leakedRuns = query("workflowSmoke.runs", {
    public: true,
    handler: async (ctx) => ctx.unsafeDb.execute("select * from _gencow_workflows"),
});
```

- workflow 목록/상세는 owner scope 또는 opaque token 검증이 있어야 함
- `_gencow_*` 테이블은 `schema.ts`와 사용자 migration에서 제외해야 함
- `drizzle.config.ts`의 `tablesFilter`에 `!_gencow_*`가 빠지면 schema drift로 오인될 수 있음

---

## ❌ 위험한 패턴

```typescript
// ❌ ctx.unsafeDb를 습관적으로 사용
ctx.unsafeDb.update(tasks).set({ done: true });  // 의도치 않게 타인의 데이터까지 덮어쓸 수 있음

// ❌ ctx.auth.requireAuth() 누락 및 세션 객체 null-check 누락
const session = ctx.auth.getSession();
ctx.db.insert(tasks).values({ userId: session?.user?.id }); // session이 null일 수 있음 
// → 무조건 requireAuth()를 사용하세요 (null이면 401 예외 자동 발생)
```

---

## Deploy 보안 감사

`gencow deploy` 시 코드 분석기가 잠재적인 취약점을 감사합니다.

| 감지 항목 | 결과 |
|--|--|
| protected handler의 `ctx.unsafeDb`/raw SQL | ⚠️ 경고 출력 |
| public handler의 미검토 `ctx.unsafeDb`/raw SQL | ⛔ 배포 차단 |
| public handler의 `_system_*` / `_gencow_*` 직접 노출 | ⛔ 배포 차단 |
| 클라이언트에서 `fetch`로 API 직접 호출 | ⚠️ 경고 출력 (항상 useQuery/useMutation 권장) |

---

## AI 보안 — LLM 직접 호출 금지

**OpenAI/Anthropic SDK를 직접 설치하지 마세요.** 통합된 `import { ai } from "./ai"`만을 이용해야 플랫폼의 보안 혜택을 온전히 받습니다.
`ctx.ai`는 런타임에서 제거되었으며, `/platform/ai/chat`과 `/platform/ai/embed` legacy route도 제공되지 않습니다.

```typescript
// ❌ 위험: API 키가 코드(또는 환경변수)에 노출되며 요금 폭탄의 주범
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ 안전: 플랫폼이 서버 수준에서 키 파편화 방지 및 관리
import { ai } from "./ai";
const reply = await ai.chat({ messages });
```

### 장점

| | 직접 호출 | `import { ai }` (Gencow) |
|--|--|--|
| API 키 | 프로젝트마다 수동 관리 | 플랫폼 레벨 **자동 주입** |
| 시크릿 코드 | 코드에 존재할 가능성 큼 | **Secret-Zero** 보장 |
| 비용 추적 | 제공업체 대시보드 파편화 | 플랫폼 **통합 과금 뷰** 제공 |
| 모델 변경 | 하드코딩된 코드 수정 | 앱 설정에서 One-click 변경 |

## Search 보안

`gencow add Search`를 사용할 때는 searchable table에 `visibility_scope`, `owner_user_id`, `corpus` canonical column을 유지하세요.

- private scope는 항상 `privateScope(ctx, corpus)`로 생성해 auth 사용자 id를 직접 주입합니다.
- `ctx.search()` / `ctx.vectorSearch()` / `ctx.hybridSearch()`는 runtime tier/capability gate를 거치므로 plan 판별을 앱 코드에서 직접 복제하지 마세요.
- `ctx.vectorSearch()`는 vector column과 extension이 있어야 하며, `ctx.hybridSearch()`는 advanced retrieval surface로만 노출하는 편이 안전합니다.
- 검색 품질 override는 `tuning` bag 아래의 제한된 knob만 사용하고, DB/provider 내부 세부 knob는 앱 코드에 노출하지 마세요.
- 검색 결과 접근 제어는 scope 컬럼과 앱의 기존 RLS 정책을 함께 유지해야 안전합니다.

## Grounded RAG 보안

`rag.askGrounded()` / `reranker.answerGrounded()`는 `ctx.grounding.answer()`를 통해 canonical `rag_*` 테이블에서만 citation을 조립합니다.

- `rag.ingest()`로 `rag_documents`에 넣은 문서는 grounded answer 대상이 아닙니다. grounded corpus는 `documents.ingest.*` 경로로 적재하세요.
- `documents.ingest.*`의 canonical embedding은 OpenAI-compatible `/platform/ai/v1/embeddings`를 사용합니다. 앱 코드에서 legacy `ctx.ai.embedMany()` 경로를 다시 만들지 마세요.
- 자체 citation 타입을 만들거나 원문 전문을 answer payload에 붙이지 마세요.
- `corpus`, `visibility`, `ownerUserId` scope를 최초 요청에서 고정하고, 재검색 단계에서 더 넓히지 마세요.
- `snippet`은 citation에 필요한 최소 발췌만 포함해야 하며, 민감 원문 전문을 provider/log에 남기면 안 됩니다.
- `grounded=false` 또는 `insufficient_evidence` claim은 사용자에게 근거 부족 상태로 표시하세요.

## Document Convert / OCR 보안

`wf.services.document.convert()`는 workflow 안에서만 호출되는 플랫폼 문서 변환/OCR 경로입니다.

- 일반 query/mutation에서 직접 OCR provider를 호출하지 말고, `workflow()` 안에서 `wf.services.document.convert()`를 사용하세요.
- OpenAI/Gemini/custom VLM 키와 prompt 설정은 플랫폼 설정입니다. 앱 코드나 tenant app 환경변수에 넣지 마세요.
- `provider: "auto"`와 `mode: "force-ocr"`를 사용하면 플랫폼 관리자 설정의 provider 순서와 기본 모델을 따릅니다.
- private corpus 문서를 외부 provider로 보내야 한다면 플랫폼 정책에서 명시적으로 허용된 경우에만 사용하세요.
- custom VLM endpoint를 앱에서 직접 호출하지 마세요. 플랫폼의 `custom_vlm` provider 설정을 통해 timeout, token, header, prompt를 중앙 관리해야 합니다.
- 변환 결과와 provider trace는 운영 진단용 최소 정보만 저장하고, 원문 전문이나 secret header를 로그에 남기지 마세요.

### 관련 스킬 설치

```bash
gencow add AI          # 텍스트 채팅, 스트리밍, 임베딩
gencow add RAG         # 문서 수집 및 벡터 검색
gencow add Memory      # Stateful 에이전트 메모리
```
