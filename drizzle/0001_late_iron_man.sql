CREATE TABLE "web_meter_calibrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meter_id" uuid NOT NULL,
	"calibrated_on" date NOT NULL,
	"next_due_ym" varchar(7),
	"agency" text,
	"certificate_no" text,
	"result" text DEFAULT 'PASS' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	CONSTRAINT "web_meter_calibrations_next_due_format" CHECK ("web_meter_calibrations"."next_due_ym" IS NULL OR "web_meter_calibrations"."next_due_ym" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "web_meter_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meter_id" uuid,
	"calibration_id" uuid,
	"file_path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"source" text DEFAULT 'UPLOAD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text
);
--> statement-breakpoint
ALTER TABLE "web_meters" ADD COLUMN "agency_no" text;--> statement-breakpoint
ALTER TABLE "web_meter_calibrations" ADD CONSTRAINT "web_meter_calibrations_meter_id_web_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."web_meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_meter_certificates" ADD CONSTRAINT "web_meter_certificates_meter_id_web_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."web_meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_meter_certificates" ADD CONSTRAINT "web_meter_certificates_calibration_id_web_meter_calibrations_id_fk" FOREIGN KEY ("calibration_id") REFERENCES "public"."web_meter_calibrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_meter_calibrations_meter_idx" ON "web_meter_calibrations" USING btree ("meter_id","calibrated_on") WHERE "web_meter_calibrations"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "web_meter_certificates_meter_idx" ON "web_meter_certificates" USING btree ("meter_id") WHERE "web_meter_certificates"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "web_meter_certificates_calibration_idx" ON "web_meter_certificates" USING btree ("calibration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "web_meter_certificates_file_path_uq" ON "web_meter_certificates" USING btree ("file_path");