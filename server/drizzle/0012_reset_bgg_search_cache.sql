-- Data-only: empty the BoardGameGeek search cache.
--
-- Cached rows were written under two now-outdated rules: results were capped at
-- 20 hits, and the cache key was the raw query (so "munchkin 2011" cached its
-- own empty result). With a 30-day TTL those rows would keep serving truncated
-- and empty lists after this deploy. The table is a pure cache — clearing it
-- costs one BGG round trip per search term, nothing more.
DELETE FROM `bgg_search_cache`;
