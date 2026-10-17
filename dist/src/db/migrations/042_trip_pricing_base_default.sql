-- V2.87: road-distance-only pricing defaults to no extra starting fee.
-- Preserve settings explicitly edited by an administrator.
UPDATE system_settings
SET value = '0', description = 'أجرة بداية المشوار بالريال', updated_at = datetime('now')
WHERE key = 'trips.base_fare' AND value = '500' AND updated_by IS NULL;
