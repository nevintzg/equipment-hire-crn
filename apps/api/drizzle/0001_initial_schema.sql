CREATE TYPE "public"."attribute_type" AS ENUM('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT');--> statement-breakpoint
CREATE TYPE "public"."block_reason" AS ENUM('BOOKING', 'MAINTENANCE', 'CLOSURE', 'INTERNAL_USE', 'RESERVED');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('PENDING_REVIEW', 'APPROVED', 'CONFIRMED', 'PICKED_UP', 'RETURNED', 'COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."booking_unit" AS ENUM('DAY', 'HOUR');--> statement-breakpoint
CREATE TYPE "public"."condition_grade" AS ENUM('NEW', 'GOOD', 'FAIR', 'POOR', 'UNSERVICEABLE');--> statement-breakpoint
CREATE TYPE "public"."equipment_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('QUEUED', 'RUNNING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."inventory_mode" AS ENUM('SERIALIZED', 'BULK');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('IMAGE', 'DOCUMENT', 'VIDEO_URL');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'DEAD');--> statement-breakpoint
CREATE TYPE "public"."page_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('STRIPE_CARD', 'BANK_TRANSFER', 'CASH', 'WAIVED');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('HIRE_AND_BOND', 'EXTRA', 'DAMAGE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."price_period" AS ENUM('PER_DAY', 'PER_HOUR', 'PER_BOOKING', 'WEEKEND', 'PER_WEEK');--> statement-breakpoint
CREATE TYPE "public"."price_tier_kind" AS ENUM('BASE', 'CUSTOMER_TYPE');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('TEXT', 'LONG_TEXT', 'SELECT', 'CHECKBOX', 'DATE', 'NUMBER');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."setting_type" AS ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'COLOR', 'FILE');--> statement-breakpoint
CREATE TYPE "public"."stock_adjustment_reason" AS ENUM('PURCHASE', 'DONATION', 'LOSS', 'DAMAGE_WRITE_OFF', 'CORRECTION', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."token_kind" AS ENUM('EMAIL_VERIFY', 'PASSWORD_RESET', 'STAFF_INVITE');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('AVAILABLE', 'ON_HIRE', 'MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED');--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "token_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"meta" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_types" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"code" "citext" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"requires_verification" boolean DEFAULT false NOT NULL,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation_domains" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"hostname" "citext" NOT NULL,
	"app" varchar(16) DEFAULT 'web' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"abn" varchar(20),
	"timezone" text DEFAULT 'Australia/Adelaide' NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"tax_rate_bp" integer DEFAULT 1000 NOT NULL,
	"contact_email" "citext",
	"contact_phone" text,
	"address_line1" text,
	"address_line2" text,
	"suburb" text,
	"state" varchar(10),
	"postcode" varchar(10),
	"stripe_secret_key_enc" text,
	"stripe_webhook_secret_enc" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"code" "citext" NOT NULL,
	"description" text NOT NULL,
	"group" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"code" "citext" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"app" varchar(16) NOT NULL,
	"family_id" uuid NOT NULL,
	"replaced_by" uuid,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"hirer_org_name" text,
	"hirer_abn" varchar(20),
	"customer_type_id" uuid,
	"customer_type_confirmed_at" timestamp with time zone,
	"customer_type_confirmed_by" uuid,
	"address_line1" text,
	"address_line2" text,
	"suburb" text,
	"state" varchar(10),
	"postcode" varchar(10),
	"email_verified_at" timestamp with time zone,
	"blocked_at" timestamp with time zone,
	"blocked_reason" text,
	"staff_notes" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"code" "citext" NOT NULL,
	"label" text NOT NULL,
	"type" "attribute_type" NOT NULL,
	"unit_label" text,
	"options" jsonb,
	"is_filterable" boolean DEFAULT false NOT NULL,
	"show_on_card" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"parent_id" uuid,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_file_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_attributes" (
	"category_id" uuid NOT NULL,
	"attribute_definition_id" uuid NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"category_id" uuid,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"sku" "citext",
	"summary" text,
	"description" text,
	"status" "equipment_status" DEFAULT 'DRAFT' NOT NULL,
	"inventory_mode" "inventory_mode" DEFAULT 'SERIALIZED' NOT NULL,
	"bulk_quantity" integer DEFAULT 0 NOT NULL,
	"booking_unit" "booking_unit" DEFAULT 'DAY' NOT NULL,
	"min_hire_units" integer DEFAULT 1 NOT NULL,
	"max_hire_units" integer,
	"turnaround_hours" integer DEFAULT 0 NOT NULL,
	"min_notice_days" integer DEFAULT 1 NOT NULL,
	"max_advance_days" integer DEFAULT 365 NOT NULL,
	"max_per_booking" integer,
	"bond_cents" integer DEFAULT 0 NOT NULL,
	"replacement_value_cents" integer,
	"requires_licence" boolean DEFAULT false NOT NULL,
	"requires_towing" boolean DEFAULT false NOT NULL,
	"requires_induction" boolean DEFAULT false NOT NULL,
	"always_requires_review" boolean DEFAULT false NOT NULL,
	"weight_kg" integer,
	"dimensions" text,
	"safety_notes" text,
	"included_items" text,
	"pickup_instructions" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "equipment_attribute_values" (
	"equipment_id" uuid NOT NULL,
	"attribute_definition_id" uuid NOT NULL,
	"value_text" text,
	"value_number" integer,
	"value_bool" boolean,
	"value_options" jsonb
);
--> statement-breakpoint
CREATE TABLE "equipment_media" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"file_id" uuid,
	"kind" "media_kind" DEFAULT 'IMAGE' NOT NULL,
	"external_url" text,
	"alt_text" text,
	"caption" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_prices" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"tier_kind" "price_tier_kind" DEFAULT 'BASE' NOT NULL,
	"customer_type_id" uuid,
	"period" "price_period" DEFAULT 'PER_DAY' NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"from_unit" integer DEFAULT 1 NOT NULL,
	"max_charge_cents" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"uploaded_at" timestamp with time zone,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "related_equipment" (
	"equipment_id" uuid NOT NULL,
	"related_equipment_id" uuid NOT NULL,
	"relation" varchar(32) DEFAULT 'SUGGESTED' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"unit_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"period" "tstzrange" NOT NULL,
	"reason" "block_reason" NOT NULL,
	"booking_id" uuid,
	"maintenance_record_id" uuid,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"unit_id" uuid,
	"booking_id" uuid,
	"context" varchar(32) NOT NULL,
	"condition" "condition_grade" NOT NULL,
	"notes" text,
	"photo_file_id" uuid,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_units" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"asset_tag" "citext" NOT NULL,
	"serial_number" text,
	"location_id" uuid,
	"status" "unit_status" DEFAULT 'AVAILABLE' NOT NULL,
	"condition" "condition_grade" DEFAULT 'GOOD' NOT NULL,
	"purchased_at" timestamp with time zone,
	"purchase_cost_cents" integer,
	"last_serviced_at" timestamp with time zone,
	"next_service_due_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_slots" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"kind" varchar(16) DEFAULT 'BOTH' NOT NULL,
	"capacity" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"suburb" text,
	"state" varchar(10),
	"postcode" varchar(10),
	"latitude" text,
	"longitude" text,
	"access_notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_records" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"unit_id" uuid,
	"kind" varchar(32) DEFAULT 'SERVICE' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"takes_out_of_service" boolean DEFAULT true NOT NULL,
	"cost_cents" integer,
	"performed_by" text,
	"description" text NOT NULL,
	"outcome" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "stock_adjustment_reason" NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_allocations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"booking_item_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"availability_block_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_answers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"label_snapshot" text NOT NULL,
	"answer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"name_snapshot" text NOT NULL,
	"unit_rate_cents" integer DEFAULT 0 NOT NULL,
	"rate_period_snapshot" varchar(32) DEFAULT 'PER_DAY' NOT NULL,
	"line_hire_cents" integer DEFAULT 0 NOT NULL,
	"line_bond_cents" integer DEFAULT 0 NOT NULL,
	"price_breakdown" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_questions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"code" "citext" NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"type" "question_type" DEFAULT 'TEXT' NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"category_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_status_history" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" "booking_status",
	"to_status" "booking_status" NOT NULL,
	"actor_user_id" uuid,
	"actor_kind" varchar(16) DEFAULT 'USER' NOT NULL,
	"reason" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"reference" "citext" NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "booking_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"booking_unit" "booking_unit" DEFAULT 'DAY' NOT NULL,
	"chargeable_units" integer DEFAULT 1 NOT NULL,
	"pickup_location_id" uuid,
	"return_location_id" uuid,
	"pickup_slot_id" uuid,
	"return_slot_id" uuid,
	"customer_type_id" uuid,
	"hire_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"bond_total_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"adjustment_cents" integer DEFAULT 0 NOT NULL,
	"total_due_cents" integer DEFAULT 0 NOT NULL,
	"gst_cents" integer DEFAULT 0 NOT NULL,
	"tax_rate_bp" integer DEFAULT 1000 NOT NULL,
	"purpose" text,
	"expected_attendees" integer,
	"delivery_required" boolean DEFAULT false NOT NULL,
	"delivery_address" text,
	"customer_notes" text,
	"staff_notes" text,
	"terms_version_id" uuid,
	"terms_accepted_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"payment_due_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancellation_reason" text,
	"picked_up_at" timestamp with time zone,
	"picked_up_by" uuid,
	"returned_at" timestamp with time zone,
	"returned_to" uuid,
	"completed_at" timestamp with time zone,
	"overdue_notified_at" timestamp with time zone,
	"late_fee_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body_markdown" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bond_deductions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"inspection_item_id" uuid,
	"kind" varchar(32) NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"is_disputed" boolean DEFAULT false NOT NULL,
	"dispute_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"booking_item_id" uuid NOT NULL,
	"unit_id" uuid,
	"quantity_returned" integer DEFAULT 0 NOT NULL,
	"quantity_missing" integer DEFAULT 0 NOT NULL,
	"condition_on_return" "condition_grade" DEFAULT 'GOOD' NOT NULL,
	"is_damaged" boolean DEFAULT false NOT NULL,
	"is_cleaning_required" boolean DEFAULT false NOT NULL,
	"notes" text,
	"photo_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"inspected_by" uuid,
	"inspected_at" timestamp with time zone,
	"all_items_returned" boolean DEFAULT true NOT NULL,
	"total_deduction_cents" integer DEFAULT 0 NOT NULL,
	"bond_refund_cents" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"signed_off_at" timestamp with time zone,
	"signed_off_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"purpose" "payment_purpose" DEFAULT 'HIRE_AND_BOND' NOT NULL,
	"method" "payment_method" DEFAULT 'STRIPE_CARD' NOT NULL,
	"status" "payment_status" DEFAULT 'REQUIRES_PAYMENT' NOT NULL,
	"hire_amount_cents" integer DEFAULT 0 NOT NULL,
	"bond_amount_cents" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"idempotency_key" text,
	"manual_reference" text,
	"recorded_by" uuid,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "refund_status" DEFAULT 'PENDING' NOT NULL,
	"reason_code" varchar(32) NOT NULL,
	"reason_note" text,
	"stripe_refund_id" text,
	"requested_by" uuid,
	"processed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"message" text NOT NULL,
	"level" varchar(16) DEFAULT 'INFO' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_dismissible" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" text,
	"changes" jsonb,
	"ip_address" text,
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_approval_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"customer_type_id" uuid,
	"category_id" uuid,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approve" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellation_tiers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"min_hours_before" integer NOT NULL,
	"refund_percent" integer NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"phone" text,
	"subject" text,
	"message" text NOT NULL,
	"user_id" uuid,
	"handled_at" timestamp with time zone,
	"handled_by" uuid,
	"staff_notes" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"code" "citext" NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_markdown" text NOT NULL,
	"available_variables" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"requested_by" uuid,
	"kind" varchar(32) NOT NULL,
	"format" varchar(8) DEFAULT 'csv' NOT NULL,
	"params" jsonb,
	"status" "export_status" DEFAULT 'QUEUED' NOT NULL,
	"file_id" uuid,
	"row_count" integer,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_sections" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"heading" text,
	"subheading" text,
	"body_markdown" text,
	"image_file_id" uuid,
	"cta_label" text,
	"cta_href" text,
	"config" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nav_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"placement" varchar(16) DEFAULT 'HEADER' NOT NULL,
	"label" text NOT NULL,
	"href" text NOT NULL,
	"parent_id" uuid,
	"opens_in_new_tab" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"event_code" "citext" NOT NULL,
	"notify_customer" boolean DEFAULT true NOT NULL,
	"notify_staff" boolean DEFAULT false NOT NULL,
	"extra_recipients" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"to_email" "citext" NOT NULL,
	"to_name" text,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text NOT NULL,
	"template_code" "citext",
	"booking_id" uuid,
	"user_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"slug" "citext" NOT NULL,
	"title" text NOT NULL,
	"body_markdown" text DEFAULT '' NOT NULL,
	"status" "page_status" DEFAULT 'DRAFT' NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"key" "citext" NOT NULL,
	"group" varchar(32) NOT NULL,
	"type" "setting_type" DEFAULT 'STRING' NOT NULL,
	"value" jsonb,
	"is_public" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_types" ADD CONSTRAINT "customer_types_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_domains" ADD CONSTRAINT "organisation_domains_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_customer_type_id_customer_types_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "public"."customer_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_attribute_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_attribute_values" ADD CONSTRAINT "equipment_attribute_values_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_attribute_values" ADD CONSTRAINT "equipment_attribute_values_attribute_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_media" ADD CONSTRAINT "equipment_media_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_media" ADD CONSTRAINT "equipment_media_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_prices" ADD CONSTRAINT "equipment_prices_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_prices" ADD CONSTRAINT "equipment_prices_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_prices" ADD CONSTRAINT "equipment_prices_customer_type_id_customer_types_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "public"."customer_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_equipment" ADD CONSTRAINT "related_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_equipment" ADD CONSTRAINT "related_equipment_related_equipment_id_equipment_id_fk" FOREIGN KEY ("related_equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_unit_id_equipment_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."equipment_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_logs" ADD CONSTRAINT "condition_logs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_logs" ADD CONSTRAINT "condition_logs_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_logs" ADD CONSTRAINT "condition_logs_unit_id_equipment_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."equipment_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_logs" ADD CONSTRAINT "condition_logs_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_logs" ADD CONSTRAINT "condition_logs_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_units" ADD CONSTRAINT "equipment_units_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_units" ADD CONSTRAINT "equipment_units_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_units" ADD CONSTRAINT "equipment_units_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_slots" ADD CONSTRAINT "location_slots_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_slots" ADD CONSTRAINT "location_slots_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_unit_id_equipment_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."equipment_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_allocations" ADD CONSTRAINT "booking_allocations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_allocations" ADD CONSTRAINT "booking_allocations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_allocations" ADD CONSTRAINT "booking_allocations_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_allocations" ADD CONSTRAINT "booking_allocations_unit_id_equipment_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."equipment_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_allocations" ADD CONSTRAINT "booking_allocations_availability_block_id_availability_blocks_id_fk" FOREIGN KEY ("availability_block_id") REFERENCES "public"."availability_blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_answers" ADD CONSTRAINT "booking_answers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_answers" ADD CONSTRAINT "booking_answers_question_id_booking_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."booking_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_questions" ADD CONSTRAINT "booking_questions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickup_location_id_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_return_location_id_locations_id_fk" FOREIGN KEY ("return_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickup_slot_id_location_slots_id_fk" FOREIGN KEY ("pickup_slot_id") REFERENCES "public"."location_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_return_slot_id_location_slots_id_fk" FOREIGN KEY ("return_slot_id") REFERENCES "public"."location_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_type_id_customer_types_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "public"."customer_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_picked_up_by_users_id_fk" FOREIGN KEY ("picked_up_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_returned_to_users_id_fk" FOREIGN KEY ("returned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_versions" ADD CONSTRAINT "terms_versions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_versions" ADD CONSTRAINT "terms_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bond_deductions" ADD CONSTRAINT "bond_deductions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bond_deductions" ADD CONSTRAINT "bond_deductions_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bond_deductions" ADD CONSTRAINT "bond_deductions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bond_deductions" ADD CONSTRAINT "bond_deductions_inspection_item_id_inspection_items_id_fk" FOREIGN KEY ("inspection_item_id") REFERENCES "public"."inspection_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bond_deductions" ADD CONSTRAINT "bond_deductions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_unit_id_equipment_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."equipment_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspected_by_users_id_fk" FOREIGN KEY ("inspected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_signed_off_by_users_id_fk" FOREIGN KEY ("signed_off_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_approval_rules" ADD CONSTRAINT "auto_approval_rules_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_approval_rules" ADD CONSTRAINT "auto_approval_rules_customer_type_id_customer_types_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "public"."customer_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_approval_rules" ADD CONSTRAINT "auto_approval_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_tiers" ADD CONSTRAINT "cancellation_tiers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_enquiries" ADD CONSTRAINT "contact_enquiries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_enquiries" ADD CONSTRAINT "contact_enquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_enquiries" ADD CONSTRAINT "contact_enquiries_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "nav_items_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_hash_uq" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_kind_idx" ON "auth_tokens" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_types_org_code_uq" ON "customer_types" USING btree ("organisation_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_domains_hostname_uq" ON "organisation_domains" USING btree ("hostname","app");--> statement-breakpoint
CREATE INDEX "organisation_domains_org_idx" ON "organisation_domains" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_slug_uq" ON "organisations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_uq" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_pk" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_code_uq" ON "roles" USING btree ("organisation_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_family_idx" ON "sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_pk" ON "user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_email_uq" ON "users" USING btree ("organisation_id","email");--> statement-breakpoint
CREATE INDEX "users_org_created_idx" ON "users" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE INDEX "users_customer_type_idx" ON "users" USING btree ("customer_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_definitions_org_code_uq" ON "attribute_definitions" USING btree ("organisation_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_slug_uq" ON "categories" USING btree ("organisation_id","slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_attributes_pk" ON "category_attributes" USING btree ("category_id","attribute_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_org_slug_uq" ON "equipment" USING btree ("organisation_id","slug");--> statement-breakpoint
CREATE INDEX "equipment_org_status_idx" ON "equipment" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "equipment_category_idx" ON "equipment" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_attribute_values_pk" ON "equipment_attribute_values" USING btree ("equipment_id","attribute_definition_id");--> statement-breakpoint
CREATE INDEX "equipment_attribute_values_attr_idx" ON "equipment_attribute_values" USING btree ("attribute_definition_id");--> statement-breakpoint
CREATE INDEX "equipment_media_equipment_idx" ON "equipment_media" USING btree ("equipment_id","sort_order");--> statement-breakpoint
CREATE INDEX "equipment_prices_equipment_idx" ON "equipment_prices" USING btree ("equipment_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_prices_tier_uq" ON "equipment_prices" USING btree ("equipment_id","tier_kind","customer_type_id","period","from_unit");--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_key_uq" ON "files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "files" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "related_equipment_pk" ON "related_equipment" USING btree ("equipment_id","related_equipment_id");--> statement-breakpoint
CREATE INDEX "availability_blocks_equipment_idx" ON "availability_blocks" USING btree ("equipment_id","is_active");--> statement-breakpoint
CREATE INDEX "availability_blocks_booking_idx" ON "availability_blocks" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "availability_blocks_unit_idx" ON "availability_blocks" USING btree ("unit_id","is_active");--> statement-breakpoint
CREATE INDEX "condition_logs_unit_idx" ON "condition_logs" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "condition_logs_booking_idx" ON "condition_logs" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_units_org_asset_tag_uq" ON "equipment_units" USING btree ("organisation_id","asset_tag");--> statement-breakpoint
CREATE INDEX "equipment_units_equipment_status_idx" ON "equipment_units" USING btree ("equipment_id","status");--> statement-breakpoint
CREATE INDEX "location_slots_location_idx" ON "location_slots" USING btree ("location_id","weekday");--> statement-breakpoint
CREATE INDEX "locations_org_idx" ON "locations" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "maintenance_records_equipment_idx" ON "maintenance_records" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "maintenance_records_unit_idx" ON "maintenance_records" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "stock_adjustments_equipment_idx" ON "stock_adjustments" USING btree ("equipment_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_allocations_booking_idx" ON "booking_allocations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_allocations_unit_idx" ON "booking_allocations" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_answers_uq" ON "booking_answers" USING btree ("booking_id","question_id");--> statement-breakpoint
CREATE INDEX "booking_items_booking_idx" ON "booking_items" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_items_equipment_idx" ON "booking_items" USING btree ("equipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_questions_org_code_uq" ON "booking_questions" USING btree ("organisation_id","code");--> statement-breakpoint
CREATE INDEX "booking_status_history_booking_idx" ON "booking_status_history" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_org_reference_uq" ON "bookings" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "bookings_org_status_idx" ON "bookings" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "bookings_user_idx" ON "bookings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_window_idx" ON "bookings" USING btree ("organisation_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "bookings_payment_due_idx" ON "bookings" USING btree ("payment_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_versions_org_version_uq" ON "terms_versions" USING btree ("organisation_id","version");--> statement-breakpoint
CREATE INDEX "bond_deductions_booking_idx" ON "bond_deductions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "inspection_items_inspection_idx" ON "inspection_items" USING btree ("inspection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inspections_booking_uq" ON "inspections" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_org_status_idx" ON "payments" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_checkout_session_uq" ON "payments" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_uq" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "refunds_booking_idx" ON "refunds" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_stripe_refund_uq" ON "refunds" USING btree ("stripe_refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_events_event_id_uq" ON "stripe_events" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "announcements_org_active_idx" ON "announcements" USING btree ("organisation_id","is_active");--> statement-breakpoint
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "auto_approval_rules_org_idx" ON "auto_approval_rules" USING btree ("organisation_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "cancellation_tiers_org_hours_uq" ON "cancellation_tiers" USING btree ("organisation_id","min_hours_before");--> statement-breakpoint
CREATE INDEX "contact_enquiries_org_idx" ON "contact_enquiries" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_org_code_uq" ON "email_templates" USING btree ("organisation_id","code");--> statement-breakpoint
CREATE INDEX "export_jobs_org_idx" ON "export_jobs" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE INDEX "home_sections_org_idx" ON "home_sections" USING btree ("organisation_id","sort_order");--> statement-breakpoint
CREATE INDEX "nav_items_org_placement_idx" ON "nav_items" USING btree ("organisation_id","placement","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_rules_org_event_uq" ON "notification_rules" USING btree ("organisation_id","event_code");--> statement-breakpoint
CREATE INDEX "outbox_messages_due_idx" ON "outbox_messages" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_booking_idx" ON "outbox_messages" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_org_slug_uq" ON "pages" USING btree ("organisation_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_org_key_uq" ON "settings" USING btree ("organisation_id","key");--> statement-breakpoint
CREATE INDEX "settings_org_group_idx" ON "settings" USING btree ("organisation_id","group");