CREATE TYPE "public"."actor_type" AS ENUM('CUSTOMER', 'AGENT', 'STAFF', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ASSESSOR_ASSIGNED', 'ASSESSMENT_IN_PROGRESS', 'ASSESSMENT_COMPLETED', 'AWAITING_DECISION', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED', 'PAYMENT_PENDING', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."cover_type" AS ENUM('COMPREHENSIVE', 'FULL_THIRD_PARTY', 'THIRD_PARTY');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('POLICE_REPORT', 'CLAIM_FORM', 'DRIVER_LICENCE', 'ID_COPY', 'QUOTATION', 'DAMAGE_PHOTO', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."session_state" AS ENUM('IDLE', 'AWAITING_POLICE_REPORT', 'CONFIRMING_POLICE_REPORT');--> statement-breakpoint
CREATE TABLE "claim_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"type" "document_type" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"whatsapp_media_id" text,
	"extraction" jsonb,
	"review" jsonb,
	"extraction_model" text,
	"needs_human_review" boolean,
	"customer_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_status" "claim_status",
	"to_status" "claim_status",
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"status" "claim_status" DEFAULT 'DRAFT' NOT NULL,
	"accident_date" date,
	"accident_time" text,
	"accident_place" text,
	"description" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "conversation_sessions" (
	"phone" text PRIMARY KEY NOT NULL,
	"customer_id" uuid,
	"state" "session_state" DEFAULT 'IDLE' NOT NULL,
	"active_claim_id" uuid,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"first_name" text NOT NULL,
	"surname" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"policy_number" text NOT NULL,
	"cover_type" "cover_type" NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_policy_number_unique" UNIQUE("policy_number")
);
--> statement-breakpoint
CREATE TABLE "processed_messages" (
	"message_id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"policy_id" uuid,
	"registration" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"odometer_km" integer,
	"last_service_km" integer,
	"service_interval_km" integer,
	"tracker_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_registration_unique" UNIQUE("registration")
);
--> statement-breakpoint
ALTER TABLE "claim_documents" ADD CONSTRAINT "claim_documents_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_active_claim_id_claims_id_fk" FOREIGN KEY ("active_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_documents_claim_idx" ON "claim_documents" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_events_claim_idx" ON "claim_events" USING btree ("claim_id","created_at");--> statement-breakpoint
CREATE INDEX "claims_status_idx" ON "claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "claims_customer_idx" ON "claims" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "policies_customer_idx" ON "policies" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "vehicles_customer_idx" ON "vehicles" USING btree ("customer_id");