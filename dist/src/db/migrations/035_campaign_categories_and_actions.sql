-- Fix campaign save failures caused by action types used by the UI but rejected by the original CHECK constraint.
-- Preserve existing campaign rows and add explicit support for selecting multiple categories.
CREATE TABLE admin_campaigns_new (
  id TEXT PRIMARY KEY,
  title_i18n TEXT NOT NULL,
  description_i18n TEXT,
  image_file_id TEXT REFERENCES files(id),
  button_label_i18n TEXT,
  action_type TEXT NOT NULL DEFAULT 'SERVICE' CHECK (action_type IN ('SERVICE','ORDER','TRIP','CATEGORY','INTERNAL','URL','NONE')),
  action_value TEXT,
  category_slugs_json TEXT NOT NULL DEFAULT '[]',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  audience_json TEXT NOT NULL DEFAULT '{}',
  area_ids_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  CHECK (end_at > start_at)
);
INSERT INTO admin_campaigns_new (
  id,title_i18n,description_i18n,image_file_id,button_label_i18n,action_type,action_value,
  category_slugs_json,start_at,end_at,is_active,audience_json,area_ids_json,sort_order,created_by,created_at,updated_at,priority
)
SELECT id,title_i18n,description_i18n,image_file_id,button_label_i18n,action_type,action_value,
  CASE WHEN action_type='CATEGORY' AND action_value IS NOT NULL AND action_value<>'' THEN json_array(action_value) ELSE '[]' END,
  start_at,end_at,is_active,audience_json,area_ids_json,sort_order,created_by,created_at,updated_at,priority
FROM admin_campaigns;
DROP TABLE admin_campaigns;
ALTER TABLE admin_campaigns_new RENAME TO admin_campaigns;
CREATE INDEX IF NOT EXISTS ix_campaigns_active_dates ON admin_campaigns(is_active,start_at,end_at,sort_order);
CREATE INDEX IF NOT EXISTS ix_campaigns_live_priority ON admin_campaigns(is_active,start_at,end_at,priority,sort_order);
