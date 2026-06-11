CREATE TABLE "dividends" (
	"id" serial PRIMARY KEY,
	"etf_id" integer NOT NULL,
	"ex_date" date,
	"record_date" date,
	"pay_date" date,
	"amount" numeric,
	"currency" text NOT NULL,
	"is_estimated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "etfs" (
	"id" serial PRIMARY KEY,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"market_id" text NOT NULL,
	"issuer" text,
	"frequency" text,
	"dividend_yield" numeric,
	"expense_ratio" numeric,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_holidays" (
	"id" serial PRIMARY KEY,
	"market_id" text NOT NULL,
	"date" date NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"settlement_days" integer NOT NULL,
	"close_time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" serial PRIMARY KEY,
	"dividend_id" integer NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" serial PRIMARY KEY,
	"etf_id" integer NOT NULL,
	"notify_d3" boolean DEFAULT true NOT NULL,
	"notify_d1" boolean DEFAULT true NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_etf_id_etfs_id_fkey" FOREIGN KEY ("etf_id") REFERENCES "etfs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "etfs" ADD CONSTRAINT "etfs_market_id_markets_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id");--> statement-breakpoint
ALTER TABLE "market_holidays" ADD CONSTRAINT "market_holidays_market_id_markets_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id");--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_dividend_id_dividends_id_fkey" FOREIGN KEY ("dividend_id") REFERENCES "dividends"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_etf_id_etfs_id_fkey" FOREIGN KEY ("etf_id") REFERENCES "etfs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "rls-select" ON "notification_logs" AS PERMISSIVE FOR SELECT TO public USING ("notification_logs"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-insert" ON "notification_logs" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("notification_logs"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-update" ON "notification_logs" AS PERMISSIVE FOR UPDATE TO public USING ("notification_logs"."user_id" = current_setting('app.current_user_id', true)) WITH CHECK ("notification_logs"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-delete" ON "notification_logs" AS PERMISSIVE FOR DELETE TO public USING ("notification_logs"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-select" ON "watchlists" AS PERMISSIVE FOR SELECT TO public USING ("watchlists"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-insert" ON "watchlists" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("watchlists"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-update" ON "watchlists" AS PERMISSIVE FOR UPDATE TO public USING ("watchlists"."user_id" = current_setting('app.current_user_id', true)) WITH CHECK ("watchlists"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-delete" ON "watchlists" AS PERMISSIVE FOR DELETE TO public USING ("watchlists"."user_id" = current_setting('app.current_user_id', true));