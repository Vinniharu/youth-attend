CREATE TYPE "public"."checkin_method" AS ENUM('auto_geofence', 'qr_scan', 'manual_admin');--> statement-breakpoint
CREATE TYPE "public"."notif_type" AS ENUM('single_absence', 'flagged_member');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'open', 'closed', 'processed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TABLE "attendance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" "checkin_method" NOT NULL,
	"location" geography(Point, 4326),
	"accuracy_m" real,
	"distance_m" real,
	"user_agent" text,
	"recorded_by" uuid,
	CONSTRAINT "attendance_logs_session_user_key" UNIQUE("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "church_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"center" geography(Point, 4326) NOT NULL,
	"radius_m" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "church_locations_radius_m_check" CHECK ("church_locations"."radius_m" BETWEEN 20 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "excusals" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "excusals_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"streak_at_open" integer NOT NULL,
	"assigned_to" uuid,
	"notes" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "notifications_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"type" "notif_type" NOT NULL,
	"resend_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_log_user_session_type_key" UNIQUE("user_id","session_id","type")
);
--> statement-breakpoint
CREATE TABLE "service_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_date" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"center" geography(Point, 4326) NOT NULL,
	"radius_m" integer NOT NULL,
	"qr_secret" text NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"absences_processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_sessions_service_date_unique" UNIQUE("service_date"),
	CONSTRAINT "service_sessions_window_check" CHECK ("service_sessions"."ends_at" > "service_sessions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone" text,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"consecutive_absences" integer DEFAULT 0 NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"flagged_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_session_id_service_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."service_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excusals" ADD CONSTRAINT "excusals_session_id_service_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."service_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excusals" ADD CONSTRAINT "excusals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excusals" ADD CONSTRAINT "excusals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_session_id_service_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."service_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_default_location" ON "church_locations" USING btree ("is_default") WHERE "church_locations"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_follow_up" ON "follow_ups" USING btree ("user_id") WHERE "follow_ups"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "service_sessions_center_gix" ON "service_sessions" USING gist ("center");