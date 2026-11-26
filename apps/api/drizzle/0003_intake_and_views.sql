ALTER TYPE "public"."document_type" ADD VALUE 'SKETCH' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "public"."session_state" ADD VALUE 'COLLECTING_DETAILS';--> statement-breakpoint
CREATE TABLE "claim_views" (
	"staff_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_views_staff_id_claim_id_pk" PRIMARY KEY("staff_id","claim_id")
);
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "intake" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_views" ADD CONSTRAINT "claim_views_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_views" ADD CONSTRAINT "claim_views_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;