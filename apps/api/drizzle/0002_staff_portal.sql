CREATE TYPE "public"."assessment_recommendation" AS ENUM('APPROVE', 'REJECT', 'MORE_INFO');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('PROCESSOR', 'ASSESSOR', 'ADMIN');--> statement-breakpoint
CREATE TABLE "claim_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"assessor_id" uuid NOT NULL,
	"findings" text NOT NULL,
	"damage_description" text,
	"estimated_cost" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"recommendation" "assessment_recommendation" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"assessor_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "claim_assessments" ADD CONSTRAINT "claim_assessments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_assessments" ADD CONSTRAINT "claim_assessments_assessor_id_staff_users_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_assignments" ADD CONSTRAINT "claim_assignments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_assignments" ADD CONSTRAINT "claim_assignments_assessor_id_staff_users_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_assignments" ADD CONSTRAINT "claim_assignments_assigned_by_staff_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_assessments_claim_idx" ON "claim_assessments" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_assignments_claim_idx" ON "claim_assignments" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_assignments_assessor_idx" ON "claim_assignments" USING btree ("assessor_id");