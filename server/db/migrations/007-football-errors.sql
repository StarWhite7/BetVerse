ALTER TABLE football_calls ADD COLUMN errorMessage TEXT;
UPDATE football_calls SET cacheKey='odds/bookmakers' WHERE cacheKey='odds/bookmakers?';
