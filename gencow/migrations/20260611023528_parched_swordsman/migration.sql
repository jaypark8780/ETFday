CREATE TABLE "alert_logs" (
	"id" serial PRIMARY KEY,
	"dividend_id" integer NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" serial PRIMARY KEY,
	"etf_id" integer NOT NULL,
	"notify_d3" boolean DEFAULT true NOT NULL,
	"notify_d1" boolean DEFAULT true NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY "rls-select" ON "notification_logs";--> statement-breakpoint
DROP POLICY "rls-insert" ON "notification_logs";--> statement-breakpoint
DROP POLICY "rls-update" ON "notification_logs";--> statement-breakpoint
DROP POLICY "rls-delete" ON "notification_logs";--> statement-breakpoint
DROP POLICY "rls-select" ON "watchlists";--> statement-breakpoint
DROP POLICY "rls-insert" ON "watchlists";--> statement-breakpoint
DROP POLICY "rls-update" ON "watchlists";--> statement-breakpoint
DROP POLICY "rls-delete" ON "watchlists";--> statement-breakpoint
DROP TABLE "notification_logs";--> statement-breakpoint
DROP TABLE "watchlists";--> statement-breakpoint
ALTER TABLE "alert_logs" ADD CONSTRAINT "alert_logs_dividend_id_dividends_id_fkey" FOREIGN KEY ("dividend_id") REFERENCES "dividends"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_logs" ADD CONSTRAINT "alert_logs_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_etf_id_etfs_id_fkey" FOREIGN KEY ("etf_id") REFERENCES "etfs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "rls-select" ON "alert_logs" AS PERMISSIVE FOR SELECT TO public USING ("alert_logs"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-insert" ON "alert_logs" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("alert_logs"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-update" ON "alert_logs" AS PERMISSIVE FOR UPDATE TO public USING ("alert_logs"."user_id" = current_setting('app.current_user_id', true)) WITH CHECK ("alert_logs"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-delete" ON "alert_logs" AS PERMISSIVE FOR DELETE TO public USING ("alert_logs"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-select" ON "watchlist_items" AS PERMISSIVE FOR SELECT TO public USING ("watchlist_items"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-insert" ON "watchlist_items" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("watchlist_items"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-update" ON "watchlist_items" AS PERMISSIVE FOR UPDATE TO public USING ("watchlist_items"."user_id" = current_setting('app.current_user_id', true)) WITH CHECK ("watchlist_items"."user_id" = current_setting('app.current_user_id', true));--> statement-breakpoint
CREATE POLICY "rls-delete" ON "watchlist_items" AS PERMISSIVE FOR DELETE TO public USING ("watchlist_items"."user_id" = current_setting('app.current_user_id', true));