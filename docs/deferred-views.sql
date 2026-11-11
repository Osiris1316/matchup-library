-- Deferred views from the design-stage migration (November 10, 2026).
-- Not part of v1. The v1 app computes matchups and coverage in the page, with
-- rules that moved on since these were written: tags can name a whole play,
-- games can log a single element, guide moments carry a civ, and a play's
-- parts match by age. Rewrite these against the v1 tables before using them.

-- ===========================================================================
-- Derived views: what might I face
-- ===========================================================================

-- The one rule for "documented": an element is documented for an opponent
-- civ on a map type when either exists:
--   a tag for this civ and element that applies to this map type (any age)
--   a game play run by this civ, in any game, whose strategy contains the
--   element, on a map of this type or with no map
-- Tags on one map, or a feature, do not carry over to other map types.
CREATE VIEW v_element_documented AS
SELECT
  c.id  AS opponent_civ_id,
  mt.id AS map_type_id,
  e.id  AS element_id
FROM civs c
JOIN map_types mt
JOIN elements e
WHERE c.is_active = 1
  AND mt.is_active = 1
  AND e.is_active = 1
  AND (
    EXISTS (SELECT 1 FROM civ_element_tags t
             JOIN v_tag_map_types tm ON tm.tag_id = t.id
             WHERE t.civ_id = c.id AND t.element_id = e.id AND tm.map_type_id = mt.id)
    OR EXISTS (SELECT 1 FROM games g
                JOIN game_plays gp ON gp.game_id = g.id AND gp.run_by = 'opponent'
                JOIN strategy_elements se ON se.strategy_id = gp.strategy_id
                LEFT JOIN maps m ON m.id = g.map_id
                WHERE g.opponent_civ_id = c.id AND se.element_id = e.id
                  AND (g.map_id IS NULL OR m.map_type_id = mt.id))
    OR EXISTS (SELECT 1 FROM games g
                JOIN game_plays gp ON gp.game_id = g.id AND gp.run_by = 'player'
                JOIN strategy_elements se ON se.strategy_id = gp.strategy_id
                LEFT JOIN maps m ON m.id = g.map_id
                WHERE g.player_civ_id = c.id AND se.element_id = e.id
                  AND (g.map_id IS NULL OR m.map_type_id = mt.id))
  );

-- What an opponent civ has been documented doing with each element, on a
-- map type: the rows of v_element_documented with counts for display.
--   general_tag_count  tags with no place
--   placed_tag_count   tags for this map type, or a feature or map within it
--   seen_count         plays run by this civ in other people's games
--   faced_count        plays run by this civ against you in your games
-- For a specific map, the app shows this list for the map's type and picks out
-- the tags and plays for that map, or its features, from the tables directly.
-- Filter with: WHERE opponent_civ_id = ? AND map_type_id = ?
CREATE VIEW v_matchup_elements AS
SELECT
  d.opponent_civ_id,
  d.map_type_id,
  d.element_id,
  e.kind_id,
  (SELECT COUNT(*) FROM civ_element_tags t
    WHERE t.civ_id = d.opponent_civ_id AND t.element_id = d.element_id AND t.is_active = 1
      AND t.map_type_id IS NULL AND t.feature_id IS NULL AND t.map_id IS NULL
  ) AS general_tag_count,
  (SELECT COUNT(*) FROM civ_element_tags t
    JOIN v_tag_map_types tm ON tm.tag_id = t.id
    WHERE t.civ_id = d.opponent_civ_id AND t.element_id = d.element_id
      AND tm.map_type_id = d.map_type_id
      AND (t.map_type_id IS NOT NULL OR t.feature_id IS NOT NULL OR t.map_id IS NOT NULL)
  ) AS placed_tag_count,
  (SELECT COUNT(*) FROM v_game_plays_resolved gp
    WHERE gp.ran_civ_id = d.opponent_civ_id AND gp.is_mine = 0
      AND (gp.map_id IS NULL OR gp.map_type_id = d.map_type_id)
      AND gp.strategy_id IN (SELECT se.strategy_id FROM strategy_elements se
                              WHERE se.element_id = d.element_id)
  ) AS seen_count,
  (SELECT COUNT(*) FROM v_game_plays_resolved gp
    WHERE gp.ran_civ_id = d.opponent_civ_id AND gp.is_mine = 1 AND gp.run_by = 'opponent'
      AND (gp.map_id IS NULL OR gp.map_type_id = d.map_type_id)
      AND gp.strategy_id IN (SELECT se.strategy_id FROM strategy_elements se
                              WHERE se.element_id = d.element_id)
  ) AS faced_count
FROM v_element_documented d
JOIN elements e ON e.id = d.element_id;

-- Whole strategies an opponent civ might run on a map type. A strategy
-- appears when this civ has been seen running it in any game, or when every
-- one of its elements is documented for this civ.
--   evidence: 'seen' or 'from its parts'
-- Filter with: WHERE opponent_civ_id = ? AND map_type_id = ?
CREATE VIEW v_matchup_strategies AS
SELECT
  d.*,
  CASE WHEN d.seen_count + d.faced_count > 0 THEN 'seen' ELSE 'from its parts' END AS evidence
FROM (
  SELECT
    c.id  AS opponent_civ_id,
    mt.id AS map_type_id,
    s.id  AS strategy_id,
    (SELECT COUNT(DISTINCT se.element_id) FROM strategy_elements se
      WHERE se.strategy_id = s.id
    ) AS element_count,
    (SELECT COUNT(DISTINCT se.element_id) FROM strategy_elements se
      JOIN v_element_documented ed
        ON ed.element_id = se.element_id
       AND ed.opponent_civ_id = c.id
       AND ed.map_type_id = mt.id
      WHERE se.strategy_id = s.id
    ) AS elements_documented,
    (SELECT COUNT(*) FROM v_game_plays_resolved gp
      WHERE gp.strategy_id = s.id AND gp.ran_civ_id = c.id AND gp.is_mine = 0
        AND (gp.map_id IS NULL OR gp.map_type_id = mt.id)
    ) AS seen_count,
    (SELECT COUNT(*) FROM v_game_plays_resolved gp
      WHERE gp.strategy_id = s.id AND gp.ran_civ_id = c.id AND gp.is_mine = 1 AND gp.run_by = 'opponent'
        AND (gp.map_id IS NULL OR gp.map_type_id = mt.id)
    ) AS faced_count
  FROM civs c
  JOIN map_types mt
  JOIN strategies s
  WHERE c.is_active = 1 AND mt.is_active = 1 AND s.is_active = 1
) d
WHERE d.seen_count + d.faced_count > 0
   OR (d.element_count > 0 AND d.elements_documented = d.element_count);


-- ===========================================================================
-- Derived views: study queues
-- ===========================================================================

-- Element study queue. For my civ, their civ and a map type: every documented
-- element, how well it is answered, and how often it has hurt you.
-- Coverage levels, worst first:
--   no examples                  no live marked moment of anyone answering it
--   examples, no written answer  marked footage exists but no answer applies
--   answer not yet practiced     best applicable answer is idea or studying
--   covered                      an applicable answer is practiced or proven
-- Answers of any age count here; v_strategy_coverage matches ages per step.
-- Answer examples are marks showing the answer, on the element or on a
-- strategy that contains it. times_faced and times_hurt count plays your
-- opponent ran against you as my_civ, on any map, whose strategy contains
-- the element. A play hurt you if it worked for them or you weren't ready.
-- Filter with: WHERE my_civ_id = ? AND opponent_civ_id = ? AND map_type_id = ?
CREATE VIEW v_element_coverage AS
SELECT
  x.my_civ_id,
  x.opponent_civ_id,
  x.map_type_id,
  x.element_id,
  x.kind_id,
  x.response_count,
  CASE x.best_rank
    WHEN 1 THEN 'idea' WHEN 2 THEN 'studying' WHEN 3 THEN 'practiced' WHEN 4 THEN 'proven'
  END AS best_response_status,
  x.example_count,
  x.my_civ_example_count,
  x.times_faced,
  x.times_hurt,
  CASE
    WHEN x.best_rank >= 3     THEN 'covered'
    WHEN x.response_count > 0 THEN 'answer not yet practiced'
    WHEN x.example_count > 0  THEN 'examples, no written answer'
    ELSE 'no examples'
  END AS coverage
FROM (
  SELECT
    me.id AS my_civ_id,
    t.opponent_civ_id,
    t.map_type_id,
    t.element_id,
    t.kind_id,
    (SELECT COUNT(*) FROM v_applicable_responses ar
      WHERE ar.my_civ_id = me.id AND ar.opponent_civ_id = t.opponent_civ_id
        AND ar.map_type_id = t.map_type_id AND ar.element_id = t.element_id
    ) AS response_count,
    (SELECT MAX(ar.status_rank) FROM v_applicable_responses ar
      WHERE ar.my_civ_id = me.id AND ar.opponent_civ_id = t.opponent_civ_id
        AND ar.map_type_id = t.map_type_id AND ar.element_id = t.element_id
    ) AS best_rank,
    -- Live answer marks focused on the element, plus unfocused marks on a
    -- strategy containing it (set on the mark, or through its game play).
    -- A mark focused on another element of the same play does not count.
    -- Written against the tables, three indexed counts added together,
    -- because one combined condition forces a scan of every mark.
    (SELECT COUNT(*) FROM link_marks lm
      JOIN links l ON l.id = lm.link_id
      WHERE lm.element_id = t.element_id
        AND lm.shows IN ('response', 'both') AND l.link_status = 'live')
    + (SELECT COUNT(DISTINCT lm.id) FROM strategy_elements se
        JOIN link_marks lm ON lm.strategy_id = se.strategy_id
        JOIN links l ON l.id = lm.link_id
        WHERE se.element_id = t.element_id AND lm.element_id IS NULL
          AND lm.shows IN ('response', 'both') AND l.link_status = 'live')
    + (SELECT COUNT(DISTINCT lm.id) FROM strategy_elements se
        JOIN game_plays gp ON gp.strategy_id = se.strategy_id
        JOIN link_marks lm ON lm.game_play_id = gp.id
        JOIN links l ON l.id = lm.link_id
        WHERE se.element_id = t.element_id
          AND lm.strategy_id IS NULL AND lm.element_id IS NULL
          AND lm.shows IN ('response', 'both') AND l.link_status = 'live')
    AS example_count,
    -- The same three counts, keeping marks where my civ was the answering side.
    (SELECT COUNT(*) FROM link_marks lm
      JOIN links l ON l.id = lm.link_id
      JOIN game_plays gp ON gp.id = lm.game_play_id
      JOIN games g ON g.id = gp.game_id
      WHERE lm.element_id = t.element_id
        AND lm.shows IN ('response', 'both') AND l.link_status = 'live'
        AND CASE gp.run_by WHEN 'player' THEN g.opponent_civ_id ELSE g.player_civ_id END = me.id)
    + (SELECT COUNT(DISTINCT lm.id) FROM strategy_elements se
        JOIN link_marks lm ON lm.strategy_id = se.strategy_id
        JOIN links l ON l.id = lm.link_id
        JOIN game_plays gp ON gp.id = lm.game_play_id
        JOIN games g ON g.id = gp.game_id
        WHERE se.element_id = t.element_id AND lm.element_id IS NULL
          AND lm.shows IN ('response', 'both') AND l.link_status = 'live'
          AND CASE gp.run_by WHEN 'player' THEN g.opponent_civ_id ELSE g.player_civ_id END = me.id)
    + (SELECT COUNT(DISTINCT lm.id) FROM strategy_elements se
        JOIN game_plays gp ON gp.strategy_id = se.strategy_id
        JOIN games g ON g.id = gp.game_id
        JOIN link_marks lm ON lm.game_play_id = gp.id
        JOIN links l ON l.id = lm.link_id
        WHERE se.element_id = t.element_id
          AND lm.strategy_id IS NULL AND lm.element_id IS NULL
          AND lm.shows IN ('response', 'both') AND l.link_status = 'live'
          AND CASE gp.run_by WHEN 'player' THEN g.opponent_civ_id ELSE g.player_civ_id END = me.id)
    AS my_civ_example_count,
    (SELECT COUNT(*) FROM v_game_plays_resolved gp
      WHERE gp.is_mine = 1 AND gp.run_by = 'opponent'
        AND gp.answer_civ_id = me.id AND gp.ran_civ_id = t.opponent_civ_id
        AND gp.strategy_id IN (SELECT se.strategy_id FROM strategy_elements se
                                WHERE se.element_id = t.element_id)
    ) AS times_faced,
    (SELECT COUNT(*) FROM v_game_plays_resolved gp
      WHERE gp.is_mine = 1 AND gp.run_by = 'opponent'
        AND gp.answer_civ_id = me.id AND gp.ran_civ_id = t.opponent_civ_id
        AND gp.strategy_id IN (SELECT se.strategy_id FROM strategy_elements se
                                WHERE se.element_id = t.element_id)
        AND (gp.outcome = 'worked'
             OR gp.preparedness IN ('did_not_see', 'saw_no_plan', 'plan_misexecuted'))
    ) AS times_hurt
  FROM civs me
  JOIN v_matchup_elements t
  WHERE me.is_active = 1
) x;

-- Strategy study queue. Same idea for whole plays, with one extra level,
-- because knowing each part is not the same as knowing the whole:
--   no examples                  no live marked moment answering it or any of its elements
--   examples, no written answer  marked footage exists but no answer applies
--   answer not yet practiced     some answer exists, but neither level below holds
--   covered by parts             every step has a practiced or proven element
--                                answer for its age, but the play itself does not
--   covered                      an answer to the whole play is practiced or proven
-- An element answer fits a step when either has no age or the ages match.
-- Filter with: WHERE my_civ_id = ? AND opponent_civ_id = ? AND map_type_id = ?
CREATE VIEW v_strategy_coverage AS
SELECT
  x.my_civ_id,
  x.opponent_civ_id,
  x.map_type_id,
  x.strategy_id,
  x.evidence,
  x.step_count,
  x.steps_answered,
  x.direct_response_count,
  CASE x.direct_best_rank
    WHEN 1 THEN 'idea' WHEN 2 THEN 'studying' WHEN 3 THEN 'practiced' WHEN 4 THEN 'proven'
  END AS direct_response_status,
  x.element_response_count,
  x.example_count,
  x.my_civ_example_count,
  x.times_faced,
  x.times_hurt,
  CASE
    WHEN x.direct_best_rank >= 3 THEN 'covered'
    WHEN x.step_count > 0 AND x.steps_answered = x.step_count THEN 'covered by parts'
    WHEN x.direct_response_count + x.element_response_count > 0 THEN 'answer not yet practiced'
    WHEN x.example_count > 0 THEN 'examples, no written answer'
    ELSE 'no examples'
  END AS coverage
FROM (
  SELECT
    me.id AS my_civ_id,
    t.opponent_civ_id,
    t.map_type_id,
    t.strategy_id,
    t.evidence,
    (SELECT COUNT(*) FROM strategy_elements se WHERE se.strategy_id = t.strategy_id) AS step_count,
    (SELECT COUNT(*) FROM strategy_elements se
      WHERE se.strategy_id = t.strategy_id
        AND EXISTS (SELECT 1 FROM v_applicable_responses ar
                     WHERE ar.my_civ_id = me.id AND ar.opponent_civ_id = t.opponent_civ_id
                       AND ar.map_type_id = t.map_type_id
                       AND ar.element_id = se.element_id AND ar.status_rank >= 3
                       AND (ar.age IS NULL OR se.age IS NULL OR ar.age = se.age))
    ) AS steps_answered,
    (SELECT COUNT(*) FROM v_applicable_responses ar
      WHERE ar.my_civ_id = me.id AND ar.opponent_civ_id = t.opponent_civ_id
        AND ar.map_type_id = t.map_type_id AND ar.strategy_id = t.strategy_id
    ) AS direct_response_count,
    (SELECT MAX(ar.status_rank) FROM v_applicable_responses ar
      WHERE ar.my_civ_id = me.id AND ar.opponent_civ_id = t.opponent_civ_id
        AND ar.map_type_id = t.map_type_id AND ar.strategy_id = t.strategy_id
    ) AS direct_best_rank,
    (SELECT COUNT(DISTINCT ar.response_id) FROM strategy_elements se
      JOIN v_applicable_responses ar ON ar.element_id = se.element_id
      WHERE se.strategy_id = t.strategy_id
        AND ar.my_civ_id = me.id AND ar.opponent_civ_id = t.opponent_civ_id
        AND ar.map_type_id = t.map_type_id
        AND (ar.age IS NULL OR se.age IS NULL OR ar.age = se.age)
    ) AS element_response_count,
    -- Live answer marks on the strategy (set on the mark, or through its game
    -- play), plus marks on one of its elements in another context, each
    -- counted once. Three indexed counts added together, as in v_element_coverage.
    (SELECT COUNT(*) FROM link_marks lm
      JOIN links l ON l.id = lm.link_id
      WHERE lm.strategy_id = t.strategy_id
        AND lm.shows IN ('response', 'both') AND l.link_status = 'live')
    + (SELECT COUNT(*) FROM game_plays gp
        JOIN link_marks lm ON lm.game_play_id = gp.id
        JOIN links l ON l.id = lm.link_id
        WHERE gp.strategy_id = t.strategy_id AND lm.strategy_id IS NULL
          AND lm.shows IN ('response', 'both') AND l.link_status = 'live')
    + (SELECT COUNT(DISTINCT lm.id) FROM strategy_elements se
        JOIN link_marks lm ON lm.element_id = se.element_id
        JOIN links l ON l.id = lm.link_id
        LEFT JOIN game_plays gp ON gp.id = lm.game_play_id
        WHERE se.strategy_id = t.strategy_id
          AND COALESCE(lm.strategy_id, gp.strategy_id) IS NOT t.strategy_id
          AND lm.shows IN ('response', 'both') AND l.link_status = 'live')
    AS example_count,
    -- The same three counts, keeping marks where my civ was the answering side.
    (SELECT COUNT(*) FROM link_marks lm
      JOIN links l ON l.id = lm.link_id
      JOIN game_plays gp ON gp.id = lm.game_play_id
      JOIN games g ON g.id = gp.game_id
      WHERE lm.strategy_id = t.strategy_id
        AND lm.shows IN ('response', 'both') AND l.link_status = 'live'
        AND CASE gp.run_by WHEN 'player' THEN g.opponent_civ_id ELSE g.player_civ_id END = me.id)
    + (SELECT COUNT(*) FROM game_plays gp
        JOIN games g ON g.id = gp.game_id
        JOIN link_marks lm ON lm.game_play_id = gp.id
        JOIN links l ON l.id = lm.link_id
        WHERE gp.strategy_id = t.strategy_id AND lm.strategy_id IS NULL
          AND lm.shows IN ('response', 'both') AND l.link_status = 'live'
          AND CASE gp.run_by WHEN 'player' THEN g.opponent_civ_id ELSE g.player_civ_id END = me.id)
    + (SELECT COUNT(DISTINCT lm.id) FROM strategy_elements se
        JOIN link_marks lm ON lm.element_id = se.element_id
        JOIN links l ON l.id = lm.link_id
        JOIN game_plays gp ON gp.id = lm.game_play_id
        JOIN games g ON g.id = gp.game_id
        WHERE se.strategy_id = t.strategy_id
          AND COALESCE(lm.strategy_id, gp.strategy_id) IS NOT t.strategy_id
          AND lm.shows IN ('response', 'both') AND l.link_status = 'live'
          AND CASE gp.run_by WHEN 'player' THEN g.opponent_civ_id ELSE g.player_civ_id END = me.id)
    AS my_civ_example_count,
    (SELECT COUNT(*) FROM v_game_plays_resolved gp
      WHERE gp.is_mine = 1 AND gp.run_by = 'opponent'
        AND gp.answer_civ_id = me.id AND gp.ran_civ_id = t.opponent_civ_id
        AND gp.strategy_id = t.strategy_id
    ) AS times_faced,
    (SELECT COUNT(*) FROM v_game_plays_resolved gp
      WHERE gp.is_mine = 1 AND gp.run_by = 'opponent'
        AND gp.answer_civ_id = me.id AND gp.ran_civ_id = t.opponent_civ_id
        AND gp.strategy_id = t.strategy_id
        AND (gp.outcome = 'worked'
             OR gp.preparedness IN ('did_not_see', 'saw_no_plan', 'plan_misexecuted'))
    ) AS times_hurt
  FROM civs me
  JOIN v_matchup_strategies t
  WHERE me.is_active = 1
) x;
