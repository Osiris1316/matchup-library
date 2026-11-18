-- 0005_branches_and_answers.sql
-- Matchup Library, phase 3: branches off a game plan, answers that pair your
-- game plan with theirs, and the end of the first version's tables.
--
-- The vocabulary
--   Branch   a detour off a game plan (the spine): a play for each age it
--            covers, and the age where it flows back into the spine, or none.
--            Your branches carry a trigger, the thing you scout: an element in
--            an age, or a whole play (whose own age is the trigger's), and
--            optionally a civ. An opponent's variant is a branch with no trigger.
--            A branch belongs to its game plan, not to one matchup, so "if I
--            scout spears" works against every civ.
--   Answer   your game plan against theirs: a status, notes, and a note per
--            age for where the two meet (the clash). Optionally for one civ on
--            each side. One answer per pairing.
--
-- What this file does
--   1. Adds branches, branch_stages, answers and answer_notes.
--   2. Rebuilds game_plays and link_marks without strategy_id, and game_plays
--      with answer_id (pointing at answers) in place of response_id. Dropping
--      the old game_plays would clear every moment's link to its game play
--      (link_marks.game_play_id is ON DELETE SET NULL), so those links are
--      kept aside first and put back in the new link_marks.
--   3. Drops the first version's tables: responses and response_steps (never
--      used by the page), strategy_elements and strategies (read-only since
--      0003, when every strategy became a game plan with the same id).
--   4. Rebuilds the views, with health checks for branches and answers.
-- The undo log stays: no saved record changes shape, except answers, which
-- were never written.
-- No BEGIN/COMMIT: D1 runs each migration file as one unit.


-- ===========================================================================
-- Views that read the tables being rebuilt go first, and come back at the end
-- ===========================================================================
DROP VIEW IF EXISTS v_health;
DROP VIEW IF EXISTS v_marks_resolved;
DROP VIEW IF EXISTS v_game_plays_resolved;


-- ===========================================================================
-- Branches and answers
-- ===========================================================================
CREATE TABLE branches (
  id                  TEXT PRIMARY KEY,
  game_plan_id        TEXT NOT NULL REFERENCES game_plans (id) ON DELETE CASCADE,
  position            INTEGER NOT NULL DEFAULT 1 CHECK (position >= 1),
  name                TEXT NOT NULL,
  trigger_element_id  TEXT REFERENCES elements (id),
  trigger_play_id     TEXT REFERENCES plays (id),
  trigger_age         TEXT CHECK (trigger_age IS NULL OR trigger_age IN ('dark', 'feudal', 'castle', 'imperial')),
  trigger_civ_id      TEXT REFERENCES civs (id),
  rejoins_age         TEXT CHECK (rejoins_age IS NULL OR rejoins_age IN ('dark', 'feudal', 'castle', 'imperial')),
  tells               TEXT,
  notes               TEXT,
  status              TEXT CHECK (status IS NULL OR status IN ('idea', 'studying', 'practiced', 'proven')),
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (NOT (trigger_element_id IS NOT NULL AND trigger_play_id IS NOT NULL)),
  CHECK (trigger_element_id IS NULL OR trigger_age IS NOT NULL),   -- an element trigger says when
  CHECK (trigger_play_id IS NULL OR trigger_age IS NULL),          -- a play trigger has the play's age
  CHECK (trigger_civ_id IS NULL OR trigger_element_id IS NOT NULL OR trigger_play_id IS NOT NULL)
);
CREATE INDEX ix_branches_plan ON branches (game_plan_id, position);

-- One play per age the branch covers. Ages before the first are the spine's.
CREATE TABLE branch_stages (
  branch_id  TEXT NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  age        TEXT NOT NULL CHECK (age IN ('dark', 'feudal', 'castle', 'imperial')),
  play_id    TEXT NOT NULL REFERENCES plays (id),
  notes      TEXT,
  PRIMARY KEY (branch_id, age)
);
CREATE INDEX ix_branch_stages_play ON branch_stages (play_id);

CREATE TABLE answers (
  id               TEXT PRIMARY KEY,
  their_plan_id    TEXT NOT NULL REFERENCES game_plans (id),
  my_plan_id       TEXT NOT NULL REFERENCES game_plans (id),
  my_civ_id        TEXT REFERENCES civs (id),
  opponent_civ_id  TEXT REFERENCES civs (id),
  status           TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'studying', 'practiced', 'proven')),
  notes            TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- One answer per pairing, retired or not.
CREATE UNIQUE INDEX ux_answers_pair ON answers (their_plan_id, my_plan_id, COALESCE(my_civ_id, ''), COALESCE(opponent_civ_id, ''));
CREATE INDEX ix_answers_mine ON answers (my_plan_id);

-- Where the two plans meet, age by age: "their flood meets your crossbows".
CREATE TABLE answer_notes (
  answer_id  TEXT NOT NULL REFERENCES answers (id) ON DELETE CASCADE,
  age        TEXT NOT NULL CHECK (age IN ('dark', 'feudal', 'castle', 'imperial')),
  note       TEXT NOT NULL,
  PRIMARY KEY (answer_id, age)
);


-- ===========================================================================
-- Games: without strategy_id, and with answer_id in place of response_id
-- ===========================================================================
-- Moments' links to game plays, kept while game_plays is rebuilt.
CREATE TABLE _keep_mark_plays AS SELECT id, game_play_id FROM link_marks WHERE game_play_id IS NOT NULL;

CREATE TABLE game_plays_new (
  id              TEXT PRIMARY KEY,
  game_id         TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  position        INTEGER NOT NULL CHECK (position >= 1),
  run_by          TEXT NOT NULL CHECK (run_by IN ('player', 'opponent')),
  game_plan_id    TEXT REFERENCES game_plans (id),
  play_id         TEXT REFERENCES plays (id),
  element_id      TEXT REFERENCES elements (id),
  age             TEXT CHECK (age IS NULL OR age IN ('dark', 'feudal', 'castle', 'imperial')),
  intent          TEXT CHECK (intent IS NULL OR intent IN ('offensive', 'defensive', 'economic')),
  subject_id      TEXT REFERENCES subjects (id),
  outcome         TEXT CHECK (outcome IN ('worked', 'failed', 'mixed')),
  preparedness    TEXT CHECK (preparedness IN ('did_not_see', 'saw_no_plan', 'plan_misexecuted', 'handled')),
  answer_id       TEXT REFERENCES answers (id) ON DELETE SET NULL,
  response_notes  TEXT,                         -- what you did about it
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((game_plan_id IS NOT NULL) + (play_id IS NOT NULL) + (element_id IS NOT NULL) <= 1),
  CHECK (age IS NULL OR element_id IS NOT NULL),
  CHECK (preparedness IS NULL OR run_by = 'opponent')
);
INSERT INTO game_plays_new (id, game_id, position, run_by, game_plan_id, play_id, element_id, age, intent, subject_id, outcome, preparedness,
  answer_id, response_notes, notes, created_at)
SELECT id, game_id, position, run_by, game_plan_id, play_id, element_id, age, intent, subject_id, outcome, preparedness,
  NULL, response_notes, notes, created_at
FROM game_plays;
DROP TABLE game_plays;
ALTER TABLE game_plays_new RENAME TO game_plays;
CREATE INDEX ix_game_plays_game ON game_plays (game_id, position);
CREATE INDEX ix_game_plays_element ON game_plays (element_id) WHERE element_id IS NOT NULL;
CREATE INDEX ix_game_plays_play ON game_plays (play_id) WHERE play_id IS NOT NULL;
CREATE INDEX ix_game_plays_game_plan ON game_plays (game_plan_id) WHERE game_plan_id IS NOT NULL;

CREATE TABLE link_marks_new (
  id             TEXT PRIMARY KEY,
  link_id        TEXT NOT NULL REFERENCES links (id) ON DELETE CASCADE,
  start_seconds  INTEGER CHECK (start_seconds IS NULL OR start_seconds >= 0),
  game_play_id   TEXT REFERENCES game_plays (id) ON DELETE SET NULL,
  civ_id         TEXT REFERENCES civs (id),
  game_plan_id   TEXT REFERENCES game_plans (id),
  play_id        TEXT REFERENCES plays (id),
  element_id     TEXT REFERENCES elements (id),
  age            TEXT CHECK (age IS NULL OR age IN ('dark', 'feudal', 'castle', 'imperial')),
  intent         TEXT CHECK (intent IS NULL OR intent IN ('offensive', 'defensive', 'economic')),
  subject_id     TEXT REFERENCES subjects (id),
  shows          TEXT CHECK (shows IS NULL OR shows IN ('threat', 'response', 'both')),
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((game_plan_id IS NOT NULL) + (play_id IS NOT NULL) + (element_id IS NOT NULL) <= 1)
);
INSERT INTO link_marks_new (id, link_id, start_seconds, game_play_id, civ_id, game_plan_id, play_id, element_id, age, intent, subject_id, shows, notes, created_at)
SELECT lm.id, lm.link_id, lm.start_seconds, k.game_play_id, lm.civ_id, lm.game_plan_id, lm.play_id, lm.element_id, lm.age, lm.intent, lm.subject_id, lm.shows, lm.notes, lm.created_at
FROM link_marks lm
LEFT JOIN _keep_mark_plays k ON k.id = lm.id;
DROP TABLE link_marks;
ALTER TABLE link_marks_new RENAME TO link_marks;
DROP TABLE _keep_mark_plays;
CREATE INDEX ix_link_marks_link ON link_marks (link_id);
CREATE INDEX ix_link_marks_game_play ON link_marks (game_play_id) WHERE game_play_id IS NOT NULL;
CREATE INDEX ix_link_marks_element ON link_marks (element_id) WHERE element_id IS NOT NULL;
CREATE INDEX ix_link_marks_play ON link_marks (play_id) WHERE play_id IS NOT NULL;
CREATE INDEX ix_link_marks_game_plan ON link_marks (game_plan_id) WHERE game_plan_id IS NOT NULL;


-- ===========================================================================
-- The first version's tables
-- ===========================================================================
DROP TABLE response_steps;
DROP TABLE responses;
DROP TABLE strategy_elements;
DROP TABLE strategies;


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
  gp.answer_id,
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
-- The first five are as in 0004.
CREATE VIEW v_health AS
SELECT
  (SELECT COUNT(*) FROM play_elements x JOIN plays p ON p.id = x.play_id
    WHERE NOT EXISTS (SELECT 1 FROM v_civ_can k WHERE k.element_id = x.element_id AND k.age = p.age AND k.can = 1)
  ) AS play_step_age_not_allowed,
  (SELECT COUNT(*) FROM game_plan_stages x JOIN plays p ON p.id = x.play_id WHERE p.age <> x.age) AS stage_play_in_wrong_age,
  (SELECT COUNT(*) FROM civ_element_tags x
    JOIN v_civ_can k ON k.civ_id = x.civ_id AND k.element_id = x.element_id AND k.age = x.age
    WHERE k.can = 0
  ) AS tag_age_not_allowed,
  (SELECT COUNT(*) FROM civ_element_tags x JOIN plays p ON p.id = x.play_id
    WHERE x.is_active = 1 AND EXISTS (
      SELECT 1 FROM play_elements pe JOIN v_civ_can k ON k.element_id = pe.element_id AND k.civ_id = x.civ_id AND k.age = p.age
      WHERE pe.play_id = p.id AND k.can = 0)
  )
  + (SELECT COUNT(*) FROM civ_element_tags x
    WHERE x.is_active = 1 AND x.game_plan_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM game_plan_stages st JOIN plays p ON p.id = st.play_id JOIN play_elements pe ON pe.play_id = p.id
      JOIN v_civ_can k ON k.element_id = pe.element_id AND k.civ_id = x.civ_id AND k.age = p.age
      WHERE st.game_plan_id = x.game_plan_id AND k.can = 0)
  ) AS tags_civ_cannot,
  (SELECT COUNT(*) FROM branch_stages x JOIN plays p ON p.id = x.play_id WHERE p.age <> x.age) AS branch_play_in_wrong_age,
  -- A branch that rejoins in or before an age it still covers.
  (SELECT COUNT(*) FROM branches b JOIN branch_stages s ON s.branch_id = b.id
    WHERE b.rejoins_age IS NOT NULL
      AND (CASE s.age WHEN 'dark' THEN 1 WHEN 'feudal' THEN 2 WHEN 'castle' THEN 3 ELSE 4 END)
       >= (CASE b.rejoins_age WHEN 'dark' THEN 1 WHEN 'feudal' THEN 2 WHEN 'castle' THEN 3 ELSE 4 END)
  ) AS branch_rejoins_too_early,
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
  + (SELECT COUNT(*) FROM branch_stages x JOIN plays p ON p.id = x.play_id WHERE p.merged_into_id IS NOT NULL)
  + (SELECT COUNT(*) FROM branches x JOIN plays p ON p.id = x.trigger_play_id WHERE p.merged_into_id IS NOT NULL)
  + (SELECT COUNT(*) FROM answers x JOIN game_plans p ON p.id IN (x.their_plan_id, x.my_plan_id) WHERE x.is_active = 1 AND p.merged_into_id IS NOT NULL)
  AS references_to_merged;
