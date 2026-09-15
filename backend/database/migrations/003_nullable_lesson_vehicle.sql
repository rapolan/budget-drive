-- Make lessons.vehicle_id nullable.
--
-- A lesson should not require a vehicle assigned at booking time - vehicle
-- assignment remains a real feature (the school plans to track per-vehicle
-- mileage and maintenance in a future update), it just doesn't need to
-- happen AT the moment of booking. The schema's NOT NULL constraint
-- contradicted this: createLesson's own auto-assignment logic already had
-- a "no vehicle available - instructor will assign later" fallback path
-- that could never succeed, since the INSERT it fed into was rejected by
-- this constraint whenever a tenant had zero vehicles in its fleet.
--
-- Confirmed live in production: a real booking attempt failed with
-- "null value in column \"vehicle_id\" of relation \"lessons\" violates
-- not-null constraint" for a tenant with no vehicles at all.

ALTER TABLE lessons ALTER COLUMN vehicle_id DROP NOT NULL;
