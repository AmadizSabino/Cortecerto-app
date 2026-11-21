-- When the salon sent the WhatsApp reminder for a booking, so it isn't sent twice.
-- The owner already updates bookings under the bookings_owner policy.
alter table bookings add column reminder_sent_at timestamptz;
