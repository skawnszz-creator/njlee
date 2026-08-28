CREATE TABLE "web_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_ym" varchar(7) NOT NULL,
	"sent_on" date NOT NULL,
	"meter_count" integer NOT NULL,
	"recipient_count" integer NOT NULL,
	"result" varchar(10) NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_notifications_result_ck" CHECK ("web_notifications"."result" in ('SENT', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "web_notify_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"lang" varchar(2) DEFAULT 'ko' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	CONSTRAINT "web_notify_recipients_lang_ck" CHECK ("web_notify_recipients"."lang" in ('ko', 'ja'))
);
--> statement-breakpoint
CREATE TABLE "web_notify_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lang" varchar(2) NOT NULL,
	"subject" text NOT NULL,
	"lead" text NOT NULL,
	"footer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "web_notify_templates_lang_ck" CHECK ("web_notify_templates"."lang" in ('ko', 'ja'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "web_notifications_target_ym_uq" ON "web_notifications" USING btree ("target_ym") WHERE "web_notifications"."result" = 'SENT';--> statement-breakpoint
CREATE INDEX "web_notifications_created_idx" ON "web_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "web_notify_recipients_email_uq" ON "web_notify_recipients" USING btree ("email") WHERE "web_notify_recipients"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "web_notify_templates_lang_uq" ON "web_notify_templates" USING btree ("lang");