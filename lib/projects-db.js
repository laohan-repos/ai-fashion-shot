import { randomUUID } from 'node:crypto';
import { database } from './model-config-db.js';
import './assets-db.js';

database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    asset_group_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some(column => column.name === 'asset_group_id')) {
  database.exec('ALTER TABLE projects ADD COLUMN asset_group_id INTEGER');
}

// Recover the selected pairing for legacy projects from the source assets used by their first generated image.
const findModelSources = database.prepare("SELECT source_asset_ids AS sourceAssetIds FROM project_model_views WHERE project_key = ? ORDER BY CASE WHEN view_type = 'sheet' THEN 0 ELSE 1 END LIMIT 1");
const findClothingSource = database.prepare('SELECT source_asset_id AS sourceAssetId FROM project_clothing_white_images WHERE project_key = ? ORDER BY id LIMIT 1');
const findAssetGroup = database.prepare('SELECT group_id AS groupId FROM assets WHERE id = ?');
const attachLegacyGroup = database.prepare('UPDATE projects SET asset_group_id = ? WHERE id = ? AND asset_group_id IS NULL');
for (const project of database.prepare('SELECT id FROM projects WHERE asset_group_id IS NULL').all()) {
  let sourceAssetId = null;
  const modelSource = findModelSources.get(project.id);
  if (modelSource) {
    try { sourceAssetId = JSON.parse(modelSource.sourceAssetIds || '[]')[0] || null; } catch { sourceAssetId = null; }
  }
  if (!sourceAssetId) sourceAssetId = findClothingSource.get(project.id)?.sourceAssetId || null;
  const groupId = sourceAssetId ? findAssetGroup.get(Number(sourceAssetId))?.groupId : null;
  if (groupId) attachLegacyGroup.run(Number(groupId), project.id);
}

const seededAt = new Date().toISOString();
database.prepare('INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
  .run('autumn-commute', '秋季通勤套装', '女装视频项目', seededAt, seededAt);

export function listProjects() {
  return database.prepare(`
    SELECT p.id, p.name, p.description, p.asset_group_id AS groupId, p.created_at AS createdAt, p.updated_at AS updatedAt,
      EXISTS(SELECT 1 FROM project_model_views m WHERE m.project_key = p.id) AS hasModelView,
      EXISTS(SELECT 1 FROM project_clothing_white_images c WHERE c.project_key = p.id) AS hasClothing,
      EXISTS(SELECT 1 FROM project_dressed_model_images d WHERE d.project_key = p.id) AS hasDressedModel,
      (SELECT COUNT(*) FROM project_video_tasks v WHERE v.project_key = p.id AND v.status = 'succeeded') AS completedVideos
    FROM projects p ORDER BY p.updated_at DESC
  `).all().map(project => ({ ...project, hasModelView: Boolean(project.hasModelView), hasClothing: Boolean(project.hasClothing), hasDressedModel: Boolean(project.hasDressedModel) }));
}

export function getProject(id) {
  return listProjects().find(project => project.id === id) || null;
}

export function createProject(name, description = '', groupId = null) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const selectedGroupId = groupId ? Number(groupId) : null;
  database.prepare('INSERT INTO projects (id, name, description, asset_group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, description, selectedGroupId, createdAt, createdAt);
  return { id, name, description, groupId: selectedGroupId, createdAt, updatedAt: createdAt, hasModelView: false, hasClothing: false, hasDressedModel: false, completedVideos: 0 };
}

export function updateProject(id, name, description = '') {
  const updatedAt = new Date().toISOString();
  const result = database.prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(name, description, updatedAt, id);
  if (!result.changes) return null;
  return listProjects().find(project => project.id === id) || null;
}

export function touchProject(id) {
  database.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function setProjectGroup(id, groupId) {
  const selectedGroupId = groupId ? Number(groupId) : null;
  if (selectedGroupId) {
    const group = database.prepare("SELECT id FROM asset_groups WHERE id = ? AND asset_type = '搭配'").get(selectedGroupId);
    if (!group) return null;
  }
  const result = database.prepare('UPDATE projects SET asset_group_id = ?, updated_at = ? WHERE id = ?').run(selectedGroupId, new Date().toISOString(), id);
  if (!result.changes) return null;
  return getProject(id);
}

export function deleteProject(id) {
  database.exec('BEGIN');
  try {
    database.prepare('DELETE FROM project_video_tasks WHERE project_key = ?').run(id);
    database.prepare('DELETE FROM project_dressed_model_images WHERE project_key = ?').run(id);
    database.prepare('DELETE FROM project_clothing_white_images WHERE project_key = ?').run(id);
    database.prepare('DELETE FROM project_model_view_versions WHERE project_key = ?').run(id);
    database.prepare('DELETE FROM project_model_views WHERE project_key = ?').run(id);
    const result = database.prepare('DELETE FROM projects WHERE id = ?').run(id);
    database.exec('COMMIT');
    return result.changes > 0;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
