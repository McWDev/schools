CREATE TYPE "public"."student_gender" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('enrolled', 'suspended', 'withdrawn', 'graduated');--> statement-breakpoint
CREATE SEQUENCE "public"."student_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"relationship" text NOT NULL,
	"phone" text,
	"email" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"from_branch_id" uuid NOT NULL,
	"to_branch_id" uuid NOT NULL,
	"effective_on" date NOT NULL,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_transfers_different_branches" CHECK ("student_transfers"."from_branch_id" <> "student_transfers"."to_branch_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_number" text DEFAULT to_char(current_date, 'YYYY') || '-' || lpad(nextval('student_number_seq')::text, 5, '0') NOT NULL,
	"branch_id" uuid NOT NULL,
	"section_id" uuid,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"gender" "student_gender" NOT NULL,
	"admission_date" date NOT NULL,
	"status" "student_status" DEFAULT 'enrolled' NOT NULL,
	"previous_school" text,
	"address" text,
	"medical_notes" text,
	"photo_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_student_number_key" UNIQUE("student_number"),
	CONSTRAINT "students_id_branch_id_key" UNIQUE("id","branch_id"),
	CONSTRAINT "students_birth_before_admission" CHECK ("students"."date_of_birth" < "students"."admission_date")
);
--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_id_branch_id_key" UNIQUE("id","branch_id");--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_fk" FOREIGN KEY ("student_id","branch_id") REFERENCES "public"."students"("id","branch_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "student_transfers" ADD CONSTRAINT "student_transfers_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_transfers" ADD CONSTRAINT "student_transfers_from_branch_id_branches_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_transfers" ADD CONSTRAINT "student_transfers_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_transfers" ADD CONSTRAINT "student_transfers_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_section_fk" FOREIGN KEY ("section_id","branch_id") REFERENCES "public"."sections"("id","branch_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_guardians_student_id_idx" ON "student_guardians" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_transfers_student_id_idx" ON "student_transfers" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "students_branch_id_status_idx" ON "students" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "students_section_id_idx" ON "students" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "students_name_dob_idx" ON "students" USING btree (lower("last_name"),lower("first_name"),"date_of_birth");