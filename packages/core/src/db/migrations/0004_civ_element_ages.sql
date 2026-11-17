-- 0004_civ_element_ages.sql
-- Matchup Library, deploy 2b: ages that differ by civ.
--
-- An element has its usual ages (age_dark .. age_imperial on elements). Some
-- civs differ: English, Japanese and Sengoku make men-at-arms in the Dark Age,
-- Mongols make horsemen in the Dark Age. Opening Dark Age on the element
-- itself would open it for every civ, so the exceptions live per civ.
--
--   civ_element_ages  One row per civ, element and age the civ can do it in.
--                     No rows for a civ and element: the element's usual ages.
--                     Any rows: exactly those ages, so a gap or a later loss
--                     can be described as well as an earlier start.
--   civ_cannot        (from 0002) stays as it is: a civ with no ages at all
--                     for a universal element. It could fold in here later.
--
-- The rule that follows
--   A play step is allowed when any civ can do the element in the play's age.
--   A tag is checked against its own civ: an element tag's age, and every step
--   of a play or game plan tag. v_civ_can spells that out for the health view.
--
-- subjects.early_ages holds, from the aoe4world data, the civs that get a
-- subject earlier than most civs, as JSON {"english": 1}, ages 1 to 4. The
-- page offers these as additions; it never applies them by itself. Loaded by
-- scripts/subjects.ts, so run `pnpm subjects sql` after this migration.
--
-- Only CREATE, ADD COLUMN and view rebuilds: no table is rebuilt, and no
-- existing row changes. No BEGIN/COMMIT: D1 runs each migration file as one unit.


CREATE TABLE civ_element_ages (
  civ_id      TEXT NOT NULL REFERENCES civs (id),
  element_id  TEXT NOT NULL REFERENCES elements (id) ON DELETE CASCADE,
  age         TEXT NOT NULL CHECK (age IN ('dark', 'feudal', 'castle', 'imperial')),
  PRIMARY KEY (civ_id, element_id, age)
);
CREATE INDEX ix_civ_element_ages_element ON civ_element_ages (element_id);

ALTER TABLE subjects ADD COLUMN early_ages TEXT;    -- JSON object, civ id to aoe4world age (1 to 4)


-- ===========================================================================
-- Views
-- ===========================================================================
DROP VIEW IF EXISTS v_health;

-- Whether a civ can do an element in an age: not listed as a civ that can't,
-- and either its own ages, when it has any, or the element's usual ages.
-- The ages come from json_each rather than a UNION, to stay inside D1's
-- limit on compound selects.
CREATE VIEW v_civ_can AS
SELECT
  c.id AS civ_id,
  e.id AS element_id,
  ag.value AS age,
  CASE
    WHEN EXISTS (SELECT 1 FROM civ_cannot n WHERE n.civ_id = c.id AND n.element_id = e.id) THEN 0
    WHEN EXISTS (SELECT 1 FROM civ_element_ages a WHERE a.civ_id = c.id AND a.element_id = e.id)
      THEN EXISTS (SELECT 1 FROM civ_element_ages a WHERE a.civ_id = c.id AND a.element_id = e.id AND a.age = ag.value)
    ELSE CASE ag.value WHEN 'dark' THEN e.age_dark WHEN 'feudal' THEN e.age_feudal WHEN 'castle' THEN e.age_castle ELSE e.age_imperial END
  END AS can
FROM civs c
CROSS JOIN elements e
CROSS JOIN json_each('["dark","feudal","castle","imperial"]') ag;

-- Health check: one row, one count per kind of problem. All zero = healthy.
CREATE VIEW v_health AS
SELECT
  -- A play step no civ can do in the play's age.
  (SELECT COUNT(*) FROM play_elements x JOIN plays p ON p.id = x.play_id
    WHERE NOT EXISTS (SELECT 1 FROM v_civ_can k WHERE k.element_id = x.element_id AND k.age = p.age AND k.can = 1)
  ) AS play_step_age_not_allowed,
  (SELECT COUNT(*) FROM game_plan_stages x JOIN plays p ON p.id = x.play_id WHERE p.age <> x.age) AS stage_play_in_wrong_age,
  -- An element tag with an age its civ can't do it in.
  (SELECT COUNT(*) FROM civ_element_tags x
    JOIN v_civ_can k ON k.civ_id = x.civ_id AND k.element_id = x.element_id AND k.age = x.age
    WHERE k.can = 0
  ) AS tag_age_not_allowed,
  -- An active play or game plan tag with a step its civ can't do in that age.
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
