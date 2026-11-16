-- 0002_element_vocabulary.sql
-- Matchup Library, phase 1 of the M2 redesign: the element vocabulary.
--
-- What changes
--   Types     Elements fall into four fixed types, which colour the icon tile:
--             unit, structure, economy, and age-up or tech. They live in
--             element_kinds as four rows; the data step retires the old kinds.
--   Subjects  A subject is one thing in the game, from the aoe4world data
--             repo: a unit, a building, a landmark or a technology. It gives
--             an element its icon. Landmarks also carry a default intent.
--             The rows are loaded by scripts/subjects.ts, not by this file.
--   Intent    Offensive, defensive or economic, or none. It colours the name.
--             An element has a default intent, and every use of an element
--             (a play step, a civ tag, a game play, a moment) can override it,
--             along with the subject. The display rule: the use's value if
--             set, else the element's, else the subject's default intent.
--   Universal An element every civ can do, such as a tower or a second town
--             centre, counts for every civ without tags. civ_cannot lists the
--             civs that can't.
--
-- Nothing here changes existing rows. Converting the current elements is a
-- separate data step, kept out of git with the rest of the library data.
--
-- ALTER TABLE ... ADD COLUMN is used throughout, because every new column is
-- nullable or has a constant default. SQLite cannot change an existing CHECK
-- constraint without rebuilding the table, so nothing existing is altered.
-- No BEGIN/COMMIT: D1 runs each migration file as one unit.


-- ===========================================================================
-- Subjects: units, buildings, landmarks and technologies from aoe4world
-- ===========================================================================
CREATE TABLE subjects (
  id              TEXT PRIMARY KEY,               -- aoe4world base id, e.g. spearman, burgrave-palace
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('unit', 'building', 'landmark', 'technology')),
  min_age         INTEGER CHECK (min_age IS NULL OR min_age BETWEEN 0 AND 4),
  civs            TEXT,                           -- JSON array of civ ids; NULL when every civ has it
  icon            TEXT,                           -- path in the aoe4world images folder, e.g. units/spearman-1.png
  default_intent  TEXT CHECK (default_intent IS NULL OR default_intent IN ('offensive', 'defensive', 'economic')),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),  -- 0 = no longer in the game data
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_subjects_kind ON subjects (kind);


-- ===========================================================================
-- Elements: subject, default intent, universal
-- ===========================================================================
ALTER TABLE elements ADD COLUMN subject_id TEXT REFERENCES subjects (id);
ALTER TABLE elements ADD COLUMN intent TEXT CHECK (intent IS NULL OR intent IN ('offensive', 'defensive', 'economic'));
ALTER TABLE elements ADD COLUMN is_universal INTEGER NOT NULL DEFAULT 0 CHECK (is_universal IN (0, 1));

-- The exceptions to a universal element: civs that can't do it.
CREATE TABLE civ_cannot (
  civ_id      TEXT NOT NULL REFERENCES civs (id),
  element_id  TEXT NOT NULL REFERENCES elements (id) ON DELETE CASCADE,
  notes       TEXT,
  PRIMARY KEY (civ_id, element_id)
);
CREATE INDEX ix_civ_cannot_element ON civ_cannot (element_id);

-- The four types. The data step moves every element onto one of these and
-- retires the old kinds.
INSERT INTO element_kinds (id, name, description, sort_order, is_active) VALUES
  ('unit', 'Unit', 'Units you train', 1, 1),
  ('structure', 'Structure', 'Buildings and walls', 2, 1),
  ('economy', 'Economy', 'Villagers, town centres, resources', 3, 1),
  ('age_tech', 'Age-up or tech', 'Ageing up, landmarks and technologies', 4, 1)
ON CONFLICT (id) DO UPDATE SET name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, is_active = 1;


-- ===========================================================================
-- Uses: intent and subject overrides
-- ===========================================================================
ALTER TABLE strategy_elements ADD COLUMN intent TEXT CHECK (intent IS NULL OR intent IN ('offensive', 'defensive', 'economic'));
ALTER TABLE strategy_elements ADD COLUMN subject_id TEXT REFERENCES subjects (id);

ALTER TABLE civ_element_tags ADD COLUMN intent TEXT CHECK (intent IS NULL OR intent IN ('offensive', 'defensive', 'economic'));
ALTER TABLE civ_element_tags ADD COLUMN subject_id TEXT REFERENCES subjects (id);

ALTER TABLE game_plays ADD COLUMN intent TEXT CHECK (intent IS NULL OR intent IN ('offensive', 'defensive', 'economic'));
ALTER TABLE game_plays ADD COLUMN subject_id TEXT REFERENCES subjects (id);

ALTER TABLE link_marks ADD COLUMN intent TEXT CHECK (intent IS NULL OR intent IN ('offensive', 'defensive', 'economic'));
ALTER TABLE link_marks ADD COLUMN subject_id TEXT REFERENCES subjects (id);

-- One tag per civ, target, age, place and now intent: the same civ can tag a
-- tower used offensively and a tower used defensively. Retired tags still
-- count, as before.
DROP INDEX ux_civ_element_tags;
CREATE UNIQUE INDEX ux_civ_element_tags
  ON civ_element_tags (civ_id, COALESCE(element_id, ''), COALESCE(strategy_id, ''), COALESCE(age, ''),
                       COALESCE(map_type_id, ''), COALESCE(feature_id, ''), COALESCE(map_id, ''), COALESCE(intent, ''));
