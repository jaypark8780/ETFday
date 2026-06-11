DROP POLICY "rls-select" ON "alert_logs";--> statement-breakpoint
DROP POLICY "rls-insert" ON "alert_logs";--> statement-breakpoint
DROP POLICY "rls-update" ON "alert_logs";--> statement-breakpoint
DROP POLICY "rls-delete" ON "alert_logs";--> statement-breakpoint
DROP POLICY "rls-select" ON "watchlist_items";--> statement-breakpoint
DROP POLICY "rls-insert" ON "watchlist_items";--> statement-breakpoint
DROP POLICY "rls-update" ON "watchlist_items";--> statement-breakpoint
DROP POLICY "rls-delete" ON "watchlist_items";--> statement-breakpoint
ALTER TABLE "alert_logs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "watchlist_items" DISABLE ROW LEVEL SECURITY;