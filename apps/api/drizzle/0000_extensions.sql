-- Extensions and functions the schema depends on. Runs before the tables.
--
--   citext      case-insensitive text, so that "Dave@Example.org" and
--               "dave@example.org" collide on the users unique index instead
--               of creating two accounts.
--   btree_gist  lets one GiST index mix uuid equality with range overlap,
--               which is what the booking exclusion constraint in
--               0002_integrity.sql needs.
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- UUIDv7 generator.
--
-- Postgres only gained a native uuidv7() in version 18, and this project
-- targets the version managed free tiers actually run (16/17). The first 48
-- bits are a millisecond timestamp, so keys sort chronologically: inserts land
-- at the right-hand edge of the index instead of scattering across it like
-- random v4 keys, and `ORDER BY id` is a usable proxy for creation order.
--
-- The application generates ids itself (src/db/schema/_shared.js) because a
-- booking needs to know its id before insert, to build child rows in the same
-- transaction. This function exists so that seeds, manual SQL fixes and
-- psql-level inserts get the same kind of id instead of failing on a
-- not-null violation.
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
DECLARE
  ts_ms bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  bytes bytea;
BEGIN
  -- 6 bytes of big-endian timestamp (int8send gives 8; drop the top two)
  -- followed by 10 random bytes borrowed from a v4 uuid.
  bytes := substring(int8send(ts_ms) FROM 3 FOR 6)
        || substring(uuid_send(gen_random_uuid()) FROM 7 FOR 10);
  -- Byte 6: high nibble = version 7.
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112);
  -- Byte 8: top two bits = RFC 4122 variant.
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);
  RETURN encode(bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;
