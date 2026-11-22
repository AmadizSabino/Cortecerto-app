-- 0021: pin search_path on three helper functions from 0018–0020 (Supabase security advisor).
-- Already applied to the live project on 2026-11-22.
alter function access_rank(text) set search_path = public;
alter function salon_photos_limit() set search_path = public;
alter function promo_price(promotions, int) set search_path = public;
