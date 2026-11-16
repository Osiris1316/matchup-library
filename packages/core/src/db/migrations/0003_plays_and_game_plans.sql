-- 0003_plays_and_game_plans.sql
-- Matchup Library, phase 2 of the M2 redesign: plays per age, and game plans.
--
-- The vocabulary
--   Play       one way to play one age: an ordered list of elements, such as
--              "Spears, then towers" in the Dark Age. Grouped within the age
--              by family, such as "Barracks first" or "Straight to Castle".
--   Game plan  one play per age, Dark through early Castle: the spine.
--              What the first version called a play (table strategies) is
--              really a game plan, so every strategy becomes a game plan with
--              the same id, and everything that pointed at it follows.
--
-- What this file does
--   1. Adds plays, play_elements, game_plans and game_plan_stages.
--   2. Copies every strategy into game_plans, id for id. Splitting its steps
--      into plays per age takes judgment (ages, names, families), so that is
--      a separate data step (scripts/phase2-plays.ts), kept out of git.
--   3. Rebuilds civ_element_tags and comes_up_on so each row points at
--      exactly one of an element, a play or a game plan. SQLite can't change
--      a CHECK constraint in place, so each is created anew, copied, dropped
--      and renamed. Nothing references these two tables, so dropping the old
--      ones fires no foreign key actions elsewhere.
--   4. Adds play_id and game_plan_id to game_plays and link_marks, and moves
--      their strategy ids across. Their CHECK constraints already allow this,
--      so they are not rebuilt: link_marks points at game_plays with
--      ON DELETE SET NULL, and dropping game_plays would clear those links.
--      strategy_id stays on both tables, always empty from now on.
--   5. Rebuilds the views for the new tables, and clears the undo log, whose
--      entries describe records in the old shape.
--
-- strategies and strategy_elements stay as they are, read-only, for one
-- release, then a later migration drops them.
-- No BEGIN/COMMIT: D1 runs each migration file as one unit.


-- ===========================================================================
-- Views that read the tables being rebuilt go first, and come back at the end
-- ===========================================================================
DROP VIEW IF EXISTS v_health;
DROP VIEW IF EXISTS v_marks_resolved;
DROP VIEW IF EXISTS v_game_plays_resolved;
DROP VIEW IF EXISTS v_strategy_sequences;


-- ===========================================================================
-- Plays and game plans
-- ===========================================================================
CREATE TABLE plays (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  age             TEXT NOT NULL CHECK (age IN ('dark', 'feudal', 'castle', 'imperial')),
  family          TEXT,                         -- grouping within the age, e.g. Barracks first
  description     TEXT,
  tells           TEXT,                         -- what it looks like when scouted
  notes           TEXT,
  where_note      TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  merged_into_id  TEXT REFERENCES plays (id),
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (merged_into_id IS NULL OR (merged_into_id <> id AND is_active = 0))
);
CREATE INDEX ix_plays_age ON plays (age);

-- The elements of a play, in order. Same step_no = at the same time. Each
-- step can override the element's intent and subject.
CREATE TABLE play_elements (
  play_id     TEXT NOT NULL REFERENCES plays (id) ON DELETE CASCADE,
  step_no     INTEGER NOT NULL CHECK (step_no >= 1),
  element_id  TEXT NOT NULL REFERENCES elements (id),
  intent      TEXT CHECK (intent IS NULL OR intent IN ('offensive', 'defensive', 'economic')),
  subject_id  TEXT REFERENCES subjects (id),
  notes       TEXT,
  PRIMARY KEY (play_id, step_no, element_id)
);
CREATE INDEX ix_play_elements_element ON play_elements (element_id);

CREATE TABLE game_plans (
  id              TEXT PRIMARY KEY,             -- the strategy's id, for those carried over
  name            TEXT NOT NULL,
  description     TEXT,
  notes           TEXT,
  where_note      TEXT,
  status          TEXT CHECK (status IS NULL OR status IN ('idea', 'studying', 'practiced', 'proven')),  -- for your own plans
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  merged_into_id  TEXT REFERENCES game_plans (id),
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (merged_into_id IS NULL OR (merged_into_id <> id AND is_active = 0))
);

-- One play per age. A missing row means the stage isn't set yet.
CREATE TABLE game_plan_stages (
  game_plan_id  TEXT NOT NULL REFERENCES game_plans (id) ON DELETE CASCADE,
  age           TEXT NOT NULL CHECK (age IN ('dark', 'feudal', 'castle', 'imperial')),
  play_id       TEXT NOT NULL REFERENCES plays (id),
  notes         TEXT,                           -- what this plan does differently in this age
  PRIMARY KEY (game_plan_id, age)
);
CREATE INDEX ix_game_plan_stages_play ON game_plan_stages (play_id);

-- Every strategy becomes a game plan with the same id. Merges are set in a
-- second pass, because a merged plan may point at one copied after it.
INSERT INTO game_plans (id, name, description, notes, where_note, is_active, created_at, updated_at)
  SELECT id, name, description, notes, where_note, is_active, created_at, updated_at FROM strategies;
UPDATE game_plans SET merged_into_id = (SELECT s.merged_into_id FROM strategies s WHERE s.id = game_plans.id)
  WHERE id IN (SELECT id FROM strategies WHERE merged_into_id IS NOT NULL);


-- ===========================================================================
-- Tags: an element, a play or a game plan
-- ===========================================================================
CREATE TABLE civ_element_tags_new (
  id            TEXT PRIMARY KEY,
  civ_id        TEXT NOT NULL REFERENCES civs (id),
  element_id    TEXT REFERENCES elements (id),
  play_id       TEXT REFERENCES plays (id),
  game_plan_id  TEXT REFERENCES game_plans (id),
  age           TEXT CHECK (age IS NULL OR age IN ('dark', 'feudal', 'castle', 'imperial')),
  map_type_id   TEXT REFERENCES map_types (id),
  feature_id    TEXT REFERENCES map_features (id),
  map_id        TEXT REFERENCES maps (id),
  timing_note   TEXT,
  tells         TEXT,
  notes         TEXT,
  last_confirmed_on  TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  intent        TEXT CHECK (intent IS NULL OR intent IN ('offensive', 'defensive', 'economic')),
  subject_id    TEXT REFERENCES subjects (id),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((element_id IS NOT NULL) + (play_id IS NOT NULL) + (game_plan_id IS NOT NULL) = 1),
  CHECK (age IS NULL OR element_id IS NOT NULL),
  CHECK ((intent IS NULL AND subject_id IS NULL) OR element_id IS NOT NULL),
  CHECK ((map_type_id IS NOT NULL) + (feature_id IS NOT NULL) + (map_id IS NOT NULL) <= 1)
);
INSERT INTO civ_element_tags_new (id, civ_id, element_id, play_id, game_plan_id, age, map_type_id, feature_id, map_id, timing_note, tells, notes,
                                  last_confirmed_on, is_active, intent, subject_id, created_at, updated_at)
  SELECT id, civ_id, element_id, NULL, strategy_id, age, map_type_id, feature_id, map_id, timing_note, tells, notes,
         last_confirmed_on, is_active, intent, subject_id, created_at, updated_at
  FROM civ_element_tags;
DROP TABLE civ_element_tags;
ALTER TABLE civ_element_tags_new RENAME TO civ_element_tags;
-- One tag per civ, target, age, place and intent, retired or not.
CREATE UNIQUE INDEX ux_civ_element_tags
  ON civ_element_tags (civ_id, COALESCE(element_id, ''), COALESCE(play_id, ''), COALESCE(game_plan_id, ''), COALESCE(age, ''),
                       COALESCE(map_type_id, ''), COALESCE(feature_id, ''), COALESCE(map_id, ''), COALESCE(intent, ''));
CREATE INDEX ix_civ_element_tags_element ON civ_element_tags (element_id) WHERE element_id IS NOT NULL;
CREATE INDEX ix_civ_element_tags_play ON civ_element_tags (play_id) WHERE play_id IS NOT NULL;
CREATE INDEX ix_civ_element_tags_game_plan ON civ_element_tags (game_plan_id) WHERE game_plan_id IS NOT NULL;


-- ===========================================================================
-- "Comes up on": an element, a play or a game plan
-- ===========================================================================
CREATE TABLE comes_up_on_new (
  id            INTEGER PRIMARY KEY,
  element_id    TEXT REFERENCES elements (id) ON DELETE CASCADE,
  play_id       TEXT REFERENCES plays (id) ON DELETE CASCADE,
  game_plan_id  TEXT REFERENCES game_plans (id) ON DELETE CASCADE,
  map_type_id   TEXT REFERENCES map_types (id),
  feature_id    TEXT REFERENCES map_features (id),
  map_id        TEXT REFERENCES maps (id),
  CHECK ((element_id IS NOT NULL) + (play_id IS NOT NULL) + (game_plan_id IS NOT NULL) = 1),
  CHECK ((map_type_id IS NOT NULL) + (feature_id IS NOT NULL) + (map_id IS NOT NULL) = 1)
);
INSERT INTO comes_up_on_new (id, element_id, play_id, game_plan_id, map_type_id, feature_id, map_id)
  SELECT id, element_id, NULL, strategy_id, map_type_id, feature_id, map_id FROM comes_up_on;
DROP TABLE comes_up_on;
ALTER TABLE comes_up_on_new RENAME TO comes_up_on;
CREATE INDEX ix_comes_up_on_element ON comes_up_on (element_id) WHERE element_id IS NOT NULL;
CREATE INDEX ix_comes_up_on_play ON comes_up_on (play_id) WHERE play_id IS NOT NULL;
CREATE INDEX ix_comes_up_on_game_plan ON comes_up_on (game_plan_id) WHERE game_plan_id IS NOT NULL;


-- ===========================================================================
-- Games and moments: a play or a game plan as well as an element
-- ===========================================================================
ALTER TABLE game_plays ADD COLUMN play_id TEXT REFERENCES plays (id);
ALTER TABLE game_plays ADD COLUMN game_plan_id TEXT REFERENCES game_plans (id);
UPDATE game_plays SET game_plan_id = strategy_id, strategy_id = NULL WHERE strategy_id IS NOT NULL;
CREATE INDEX ix_game_plays_play ON game_plays (play_id) WHERE play_id IS NOT NULL;
CREATE INDEX ix_game_plays_game_plan ON game_plays (game_plan_id) WHERE game_plan_id IS NOT NULL;

ALTER TABLE link_marks ADD COLUMN play_id TEXT REFERENCES plays (id);
ALTER TABLE link_marks ADD COLUMN game_plan_id TEXT REFERENCES game_plans (id);
UPDATE link_marks SET game_plan_id = strategy_id, strategy_id = NULL WHERE strategy_id IS NOT NULL;
CREATE INDEX ix_link_marks_play ON link_marks (play_id) WHERE play_id IS NOT NULL;
CREATE INDEX ix_link_marks_game_plan ON link_marks (game_plan_id) WHERE game_plan_id IS NOT NULL;


-- ===========================================================================
-- Undo log: its entries hold records in the old shape, so they can't be replayed
-- ===========================================================================
DELETE FROM change_log;


-- ===========================================================================
-- Views
-- ===========================================================================

-- What each side did in each game, with the civ that did it and the civ that
-- answered it.
CREATE VIEW v_game_plays_resolved AS
SELECT
  gp.id AS game_play_id,
  gp.game_id,
  gp.position,
  gp.run_by,
  gp.game_plan_id,
  gp.play_id,
  gp.element_id,
  gp.age,
  gp.intent,
  gp.outcome,
  gp.preparedness,
  g.is_mine,
  g.played_on,
  g.map_id,
  m.map_type_id,
  g.result,
  CASE gp.run_by WHEN 'player' THEN g.player_civ_id ELSE g.opponent_civ_id END AS ran_civ_id,
  CASE gp.run_by WHEN 'player' THEN g.opponent_civ_id ELSE g.player_civ_id END AS answer_civ_id
FROM game_plays gp
JOIN games g ON g.id = gp.game_id
LEFT JOIN maps m ON m.id = g.map_id;

-- Every moment with what it shows and which civ did it.
CREATE VIEW v_marks_resolved AS
SELECT
  lm.id AS mark_id,
  lm.link_id,
  l.kind AS link_kind,
  l.game_id,
  lm.game_play_id,
  lm.start_seconds,
  COALESCE(lm.game_plan_id, gp.game_plan_id) AS game_plan_id,
  COALESCE(lm.play_id, gp.play_id) AS play_id,
  COALESCE(lm.element_id, gp.element_id) AS element_id,
  COALESCE(lm.age, gp.age) AS age,
  lm.shows,
  CASE WHEN l.link_status = 'live' THEN 1 ELSE 0 END AS is_live,
  COALESCE(lm.civ_id,
           CASE gp.run_by WHEN 'player' THEN g.player_civ_id WHEN 'opponent' THEN g.opponent_civ_id END) AS civ_id,
  gp.outcome
FROM link_marks lm
JOIN links l ON l.id = lm.link_id
LEFT JOIN game_plays gp ON gp.id = lm.game_play_id
LEFT JOIN games g ON g.id = gp.game_id;

-- Health check: one row, one count per kind of problem. All zero = healthy.
CREATE VIEW v_health AS
SELECT
  (SELECT COUNT(*) FROM play_elements x JOIN plays p ON p.id = x.play_id JOIN elements e ON e.id = x.element_id
    WHERE CASE p.age WHEN 'dark' THEN e.age_dark WHEN 'feudal' THEN e.age_feudal
                     WHEN 'castle' THEN e.age_castle ELSE e.age_imperial END = 0
  ) AS play_step_age_not_allowed,
  (SELECT COUNT(*) FROM game_plan_stages x JOIN plays p ON p.id = x.play_id WHERE p.age <> x.age) AS stage_play_in_wrong_age,
  (SELECT COUNT(*) FROM civ_element_tags x JOIN elements e ON e.id = x.element_id
    WHERE x.age IS NOT NULL
      AND CASE x.age WHEN 'dark' THEN e.age_dark WHEN 'feudal' THEN e.age_feudal
                     WHEN 'castle' THEN e.age_castle ELSE e.age_imperial END = 0
  ) AS tag_age_not_allowed,
  (SELECT COUNT(*) FROM link_marks lm
    JOIN links l ON l.id = lm.link_id
    JOIN game_plays gp ON gp.id = lm.game_play_id
    WHERE l.game_id IS NULL OR gp.game_id <> l.game_id
  ) AS marks_on_another_games_play,
  (SELECT COUNT(*) FROM game_plays gp JOIN games g ON g.id = gp.game_id
    WHERE g.is_mine = 0 AND gp.preparedness IS NOT NULL
  ) AS preparedness_outside_my_games,
  (SELECT COUNT(*) FROM civ_element_tags x JOIN plays p ON p.id = x.play_id WHERE p.merged_into_id IS NOT NULL)
  + (SELECT COUNT(*) FROM civ_element_tags x JOIN game_plans p ON p.id = x.game_plan_id WHERE p.merged_into_id IS NOT NULL)
  + (SELECT COUNT(*) FROM game_plan_stages x JOIN plays p ON p.id = x.play_id WHERE p.merged_into_id IS NOT NULL)
  + (SELECT COUNT(*) FROM game_plays x JOIN plays p ON p.id = x.play_id WHERE p.merged_into_id IS NOT NULL)
  + (SELECT COUNT(*) FROM game_plays x JOIN game_plans p ON p.id = x.game_plan_id WHERE p.merged_into_id IS NOT NULL)
  AS references_to_merged;
