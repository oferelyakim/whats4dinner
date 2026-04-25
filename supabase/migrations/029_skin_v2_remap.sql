-- Skin v2 remap — collapse retired skin ids to their v2 successor.
-- Idempotent: only updates rows where the old id is one of the retired ones.
-- Retired: coastal, ranch, pacific, tuscan, nordic, bloom, dusk
-- Kept: hearth, citrus, brooklyn, meadow, studio, night

UPDATE public.circles
   SET skin_id = CASE skin_id
     WHEN 'coastal' THEN 'hearth'
     WHEN 'ranch'   THEN 'hearth'
     WHEN 'pacific' THEN 'meadow'
     WHEN 'tuscan'  THEN 'hearth'
     WHEN 'nordic'  THEN 'brooklyn'
     WHEN 'bloom'   THEN 'meadow'
     WHEN 'dusk'    THEN 'night'
     ELSE skin_id
   END
 WHERE skin_id IN ('coastal', 'ranch', 'pacific', 'tuscan', 'nordic', 'bloom', 'dusk');
