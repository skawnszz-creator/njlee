CREATE TABLE "web_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"summary" text NOT NULL,
	"changes" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_meter_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meter_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text
);
--> statement-breakpoint
CREATE TABLE "web_meters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_no" text NOT NULL,
	"name_ko" text NOT NULL,
	"name_ja" text,
	"maker" text,
	"model" text,
	"asset_owner" text NOT NULL,
	"control_no" text,
	"calibration_due_ym" varchar(7),
	"quantity" integer DEFAULT 1 NOT NULL,
	"serial_no" text,
	"status" text DEFAULT 'IN_USE' NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	CONSTRAINT "web_meters_due_ym_format" CHECK ("web_meters"."calibration_due_ym" IS NULL OR "web_meters"."calibration_due_ym" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "web_meters_quantity_positive" CHECK ("web_meters"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "web_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_sub" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'VIEWER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text
);
--> statement-breakpoint
ALTER TABLE "web_meter_photos" ADD CONSTRAINT "web_meter_photos_meter_id_web_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."web_meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_sessions" ADD CONSTRAINT "web_sessions_user_id_web_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."web_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_audit_logs_created_idx" ON "web_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "web_audit_logs_entity_idx" ON "web_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "web_meter_photos_meter_idx" ON "web_meter_photos" USING btree ("meter_id","kind","sort_order") WHERE "web_meter_photos"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "web_meters_asset_no_uq" ON "web_meters" USING btree ("asset_no") WHERE "web_meters"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "web_meters_alive_idx" ON "web_meters" USING btree ("sort_order") WHERE "web_meters"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "web_meters_due_idx" ON "web_meters" USING btree ("calibration_due_ym");--> statement-breakpoint
CREATE INDEX "web_meters_status_idx" ON "web_meters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "web_meters_owner_idx" ON "web_meters" USING btree ("asset_owner");--> statement-breakpoint
CREATE UNIQUE INDEX "web_sessions_token_hash_uq" ON "web_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "web_sessions_user_idx" ON "web_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "web_sessions_expires_idx" ON "web_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "web_users_auth_sub_uq" ON "web_users" USING btree ("auth_sub");--> statement-breakpoint
CREATE INDEX "web_users_alive_idx" ON "web_users" USING btree ("role") WHERE "web_users"."is_deleted" = false;