-- ============================================================================
-- Invariants Drizzle cannot express, added by hand.
--
-- Everything here is a rule that must hold no matter what the application
-- does. Putting them in the database rather than in service code means they
-- survive a bug, a second API instance, a manual SQL fix at 11pm, and the
-- next developer who has not read booking.service.js.
-- ============================================================================

-- ─── 1. Ranges are half-open and non-empty ──────────────────────────────────
-- '[start, end)' — a return at 10:00 and a pickup at 10:00 do not overlap.
-- Without this, '[]' bounds would make back-to-back hires collide.
ALTER TABLE "availability_blocks"
  ADD CONSTRAINT "availability_blocks_period_bounds_chk"
  CHECK (lower_inc(period) AND NOT upper_inc(period) AND NOT isempty(period));
--> statement-breakpoint

ALTER TABLE "availability_blocks"
  ADD CONSTRAINT "availability_blocks_period_bounded_chk"
  CHECK (lower(period) IS NOT NULL AND upper(period) IS NOT NULL);
--> statement-breakpoint

-- ─── 2. Double-booking is impossible ────────────────────────────────────────
-- THE constraint of this system.
--
-- Two active blocks for the same serialized unit cannot have overlapping
-- periods. Postgres enforces it inside the index, so the usual race —
--     tx A: "is unit 3 free?" yes
--     tx B: "is unit 3 free?" yes
--     tx A: insert    tx B: insert
-- — ends with one transaction raising 23P01 (exclusion_violation) instead of
-- two customers arriving for the same marquee. The API maps 23P01 to
-- HTTP 409 and tells the customer the item just went.
--
-- Bulk stock (unit_id IS NULL) is excluded: a pool of 120 chairs legitimately
-- has many overlapping blocks, and quantity is checked under a row lock in
-- availability.service.js instead.
ALTER TABLE "availability_blocks"
  ADD CONSTRAINT "availability_blocks_no_overlap"
  EXCLUDE USING gist (
    unit_id WITH =,
    period WITH &&
  ) WHERE (is_active AND unit_id IS NOT NULL);
--> statement-breakpoint

-- Bulk blocks need a positive quantity; serialized blocks are always one.
ALTER TABLE "availability_blocks"
  ADD CONSTRAINT "availability_blocks_quantity_chk"
  CHECK (quantity > 0 AND (unit_id IS NULL OR quantity = 1));
--> statement-breakpoint

-- Deferred FK: a BOOKING block references its booking, but the two rows are
-- written in the same transaction and ordering should not matter.
ALTER TABLE "availability_blocks"
  ADD CONSTRAINT "availability_blocks_booking_id_fk"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

ALTER TABLE "condition_logs"
  ADD CONSTRAINT "condition_logs_booking_id_fk"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_terms_version_id_fk"
  FOREIGN KEY ("terms_version_id") REFERENCES "terms_versions"("id")
  ON DELETE SET NULL;
--> statement-breakpoint

-- ─── 3. Bookings run forwards and cost a sane amount ────────────────────────
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_window_chk" CHECK (end_at > start_at);
--> statement-breakpoint

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_money_chk" CHECK (
    hire_subtotal_cents >= 0
    AND bond_total_cents >= 0
    AND discount_cents >= 0
    AND total_due_cents >= 0
    AND gst_cents >= 0
    AND late_fee_cents >= 0
  );
--> statement-breakpoint

ALTER TABLE "booking_items"
  ADD CONSTRAINT "booking_items_quantity_chk" CHECK (quantity > 0);
--> statement-breakpoint

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_chk" CHECK (
    amount_cents >= 0
    AND refunded_cents >= 0
    AND refunded_cents <= amount_cents
    AND hire_amount_cents + bond_amount_cents <= amount_cents
  );
--> statement-breakpoint

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_chk" CHECK (amount_cents > 0);
--> statement-breakpoint

-- ─── 4. Prices and stock ────────────────────────────────────────────────────
ALTER TABLE "equipment_prices"
  ADD CONSTRAINT "equipment_prices_amount_chk"
  CHECK (amount_cents >= 0 AND from_unit >= 1);
--> statement-breakpoint

-- A customer-type tier must name a customer type; a base tier must not.
ALTER TABLE "equipment_prices"
  ADD CONSTRAINT "equipment_prices_tier_shape_chk" CHECK (
    (tier_kind = 'BASE' AND customer_type_id IS NULL)
    OR (tier_kind = 'CUSTOMER_TYPE' AND customer_type_id IS NOT NULL)
  );
--> statement-breakpoint

-- Postgres treats NULLs as distinct in unique indexes, so the BASE-tier rows
-- (customer_type_id IS NULL) would not be deduplicated by the generated
-- unique index. NULLS NOT DISTINCT fixes that.
DROP INDEX IF EXISTS "equipment_prices_tier_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_prices_tier_uq"
  ON "equipment_prices" (equipment_id, tier_kind, customer_type_id, period, from_unit)
  NULLS NOT DISTINCT;
--> statement-breakpoint

ALTER TABLE "equipment"
  ADD CONSTRAINT "equipment_bulk_quantity_chk" CHECK (
    bulk_quantity >= 0
    AND min_hire_units >= 1
    AND (max_hire_units IS NULL OR max_hire_units >= min_hire_units)
    AND turnaround_hours >= 0
    AND bond_cents >= 0
  );
--> statement-breakpoint

-- ─── 5. "Exactly one" rules ─────────────────────────────────────────────────
-- Partial unique indexes are the only way to say "at most one row where
-- flag is true, per organisation".
CREATE UNIQUE INDEX "terms_versions_one_current_uq"
  ON "terms_versions" (organisation_id) WHERE is_current;
--> statement-breakpoint

CREATE UNIQUE INDEX "organisation_domains_one_primary_uq"
  ON "organisation_domains" (organisation_id, app) WHERE is_primary;
--> statement-breakpoint

CREATE UNIQUE INDEX "locations_one_default_uq"
  ON "locations" (organisation_id) WHERE is_default;
--> statement-breakpoint

CREATE UNIQUE INDEX "equipment_media_one_primary_uq"
  ON "equipment_media" (equipment_id) WHERE is_primary;
--> statement-breakpoint

-- ─── 6. Configuration sanity ────────────────────────────────────────────────
ALTER TABLE "cancellation_tiers"
  ADD CONSTRAINT "cancellation_tiers_chk"
  CHECK (min_hours_before >= 0 AND refund_percent BETWEEN 0 AND 100 AND fee_cents >= 0);
--> statement-breakpoint

ALTER TABLE "location_slots"
  ADD CONSTRAINT "location_slots_chk" CHECK (
    weekday BETWEEN 0 AND 6
    AND start_time < end_time
    AND (capacity IS NULL OR capacity > 0)
  );
--> statement-breakpoint

ALTER TABLE "organisations"
  ADD CONSTRAINT "organisations_tax_rate_chk" CHECK (tax_rate_bp BETWEEN 0 AND 10000);
--> statement-breakpoint

ALTER TABLE "organisation_domains"
  ADD CONSTRAINT "organisation_domains_app_chk" CHECK (app IN ('web', 'admin'));
--> statement-breakpoint

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_app_chk" CHECK (app IN ('web', 'admin'));
--> statement-breakpoint

-- ─── 7. Hot-path indexes the ORM did not generate ───────────────────────────
-- Overlap queries need a GiST index on the range itself; the exclusion
-- constraint above only covers rows with a unit_id, so bulk availability
-- lookups would otherwise sequential-scan.
CREATE INDEX "availability_blocks_period_gist"
  ON "availability_blocks" USING gist (equipment_id, period) WHERE is_active;
--> statement-breakpoint

-- The admin "needs attention" queue: pending bookings, oldest first.
CREATE INDEX "bookings_pending_queue_idx"
  ON "bookings" (organisation_id, submitted_at)
  WHERE status = 'PENDING_REVIEW';
--> statement-breakpoint

-- The hourly tick's three reconciliation queries.
CREATE INDEX "bookings_awaiting_payment_idx"
  ON "bookings" (payment_due_at) WHERE status = 'APPROVED';
--> statement-breakpoint

CREATE INDEX "bookings_on_hire_idx"
  ON "bookings" (organisation_id, end_at) WHERE status = 'PICKED_UP';
--> statement-breakpoint

CREATE INDEX "outbox_messages_pending_idx"
  ON "outbox_messages" (next_attempt_at) WHERE status = 'PENDING';
--> statement-breakpoint

-- Case-insensitive catalogue search without a full-text setup. pg_trgm would
-- be better, but it is not available on every managed Postgres free tier.
CREATE INDEX "equipment_name_search_idx"
  ON "equipment" (organisation_id, lower(name));
