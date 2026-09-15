-- Only vehicle ownership should be required at creation time - the school
-- knows who owns a vehicle (the school itself, or a specific instructor)
-- before they know its make/model/mileage/registration details, and will
-- fill those in over time. Make/model/year/license plate/registration and
-- insurance expiration were all NOT NULL, blocking legitimate incomplete
-- entry. current_mileage already has a DEFAULT 0 and stays NOT NULL - "no
-- mileage recorded yet" is meaningfully 0, not unknown, for the planned
-- mileage-tracking feature.

ALTER TABLE vehicles ALTER COLUMN make DROP NOT NULL;
ALTER TABLE vehicles ALTER COLUMN model DROP NOT NULL;
ALTER TABLE vehicles ALTER COLUMN year DROP NOT NULL;
ALTER TABLE vehicles ALTER COLUMN license_plate DROP NOT NULL;
ALTER TABLE vehicles ALTER COLUMN registration_expiration DROP NOT NULL;
ALTER TABLE vehicles ALTER COLUMN insurance_expiration DROP NOT NULL;

-- The existing idx_vehicles_license_plate_tenant UNIQUE constraint on
-- (tenant_id, license_plate) already tolerates multiple NULLs correctly
-- under standard SQL NULL semantics (NULL is never considered equal to
-- another NULL for uniqueness purposes) - no change needed there.
