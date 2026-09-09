import { database } from './model-config-db.js';

database.exec(`
  CREATE TABLE IF NOT EXISTS asset_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_type TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(asset_type, name)
  );
  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    asset_type TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    image_data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(group_id) REFERENCES asset_groups(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS asset_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    image_data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS project_model_views (
    project_key TEXT NOT NULL,
    view_type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    source_asset_ids TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    image_data BLOB NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(project_key, view_type)
  );
  CREATE TABLE IF NOT EXISTS project_model_view_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT NOT NULL,
    prompt TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    image_data BLOB NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_clothing_white_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT NOT NULL,
    source_asset_id INTEGER NOT NULL,
    source_asset_name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    image_data BLOB NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_key, source_asset_id)
  );
  CREATE TABLE IF NOT EXISTS project_dressed_model_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT NOT NULL,
    source_model_version_id TEXT NOT NULL,
    source_clothing_image_id INTEGER NOT NULL,
    scene TEXT NOT NULL DEFAULT '',
    output_path TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    image_data BLOB NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_video_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT NOT NULL,
    dressed_model_image_id INTEGER NOT NULL DEFAULT 0,
    shot_index INTEGER NOT NULL,
    shot_name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    remote_task_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'submitted',
    output_path TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    archive_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS project_model_view_versions_project_index ON project_model_view_versions(project_key);
  CREATE INDEX IF NOT EXISTS project_clothing_white_images_project_index ON project_clothing_white_images(project_key);
  CREATE INDEX IF NOT EXISTS assets_group_id_index ON assets(group_id);
  CREATE INDEX IF NOT EXISTS asset_versions_asset_id_index ON asset_versions(asset_id);
`);

let dressedModelColumns = database.prepare('PRAGMA table_info(project_dressed_model_images)').all();
if (!dressedModelColumns.some(column => column.name === 'scene')) {
  database.exec("ALTER TABLE project_dressed_model_images ADD COLUMN scene TEXT NOT NULL DEFAULT ''");
}
if (!dressedModelColumns.some(column => column.name === 'output_path')) {
  database.exec("ALTER TABLE project_dressed_model_images ADD COLUMN output_path TEXT NOT NULL DEFAULT ''");
}
dressedModelColumns = database.prepare('PRAGMA table_info(project_dressed_model_images)').all();
if (!dressedModelColumns.some(column => column.name === 'id')) {
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(`
      CREATE TABLE project_dressed_model_images_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_key TEXT NOT NULL,
        source_model_version_id TEXT NOT NULL,
        source_clothing_image_id INTEGER NOT NULL,
        scene TEXT NOT NULL DEFAULT '',
        output_path TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        image_data BLOB NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO project_dressed_model_images_next
        (project_key, source_model_version_id, source_clothing_image_id, scene, output_path, prompt, mime_type, image_data, updated_at)
      SELECT project_key, source_model_version_id, source_clothing_image_id, scene, output_path, prompt, mime_type, image_data, updated_at
      FROM project_dressed_model_images;
      DROP TABLE project_dressed_model_images;
      ALTER TABLE project_dressed_model_images_next RENAME TO project_dressed_model_images;
      CREATE INDEX IF NOT EXISTS project_dressed_model_images_project_index ON project_dressed_model_images(project_key, id DESC);
    `);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
database.exec('CREATE INDEX IF NOT EXISTS project_dressed_model_images_project_index ON project_dressed_model_images(project_key, id DESC)');

const videoTaskColumns = database.prepare('PRAGMA table_info(project_video_tasks)').all();
if (!videoTaskColumns.some(column => column.name === 'dressed_model_image_id')) {
  database.exec('ALTER TABLE project_video_tasks ADD COLUMN dressed_model_image_id INTEGER NOT NULL DEFAULT 0');
}

// Migrate the old, separate model/clothing folders into paired collections.
// Matching positions are treated as one legacy pairing; asset and version IDs stay unchanged.
const legacyModelGroups = database.prepare("SELECT id, name, created_at AS createdAt FROM asset_groups WHERE asset_type = '模特' ORDER BY id").all();
const legacyClothingGroups = database.prepare("SELECT id, name, created_at AS createdAt FROM asset_groups WHERE asset_type = '服装' ORDER BY id").all();
if (legacyModelGroups.length > 0 || legacyClothingGroups.length > 0) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const pairCount = Math.max(legacyModelGroups.length, legacyClothingGroups.length);
    for (let index = 0; index < pairCount; index += 1) {
      const modelGroup = legacyModelGroups[index];
      const clothingGroup = legacyClothingGroups[index];
      const baseName = modelGroup && clothingGroup
        ? (modelGroup.name === clothingGroup.name ? modelGroup.name : `${modelGroup.name} × ${clothingGroup.name}`)
        : (modelGroup?.name || clothingGroup?.name || `搭配 ${index + 1}`);
      let name = baseName.slice(0, 24);
      let suffix = 2;
      while (database.prepare("SELECT id FROM asset_groups WHERE asset_type = '搭配' AND name = ?").get(name)) {
        name = `${baseName.slice(0, Math.max(1, 21 - String(suffix).length))}-${suffix}`;
        suffix += 1;
      }
      const createdAt = modelGroup?.createdAt || clothingGroup?.createdAt || new Date().toISOString();
      const result = database.prepare("INSERT INTO asset_groups (asset_type, name, created_at) VALUES ('搭配', ?, ?)").run(name, createdAt);
      const pairedGroupId = Number(result.lastInsertRowid);
      if (modelGroup) database.prepare('UPDATE assets SET group_id = ? WHERE group_id = ?').run(pairedGroupId, modelGroup.id);
      if (clothingGroup) database.prepare('UPDATE assets SET group_id = ? WHERE group_id = ?').run(pairedGroupId, clothingGroup.id);
    }
    database.prepare("DELETE FROM asset_groups WHERE asset_type IN ('模特', '服装')").run();
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function listGroups(assetType) {
  const groups = database.prepare(`
    SELECT g.id, g.name, g.asset_type AS assetType, COUNT(a.id) AS assetCount,
      SUM(CASE WHEN a.asset_type = '模特' THEN 1 ELSE 0 END) AS modelCount,
      SUM(CASE WHEN a.asset_type = '服装' THEN 1 ELSE 0 END) AS clothingCount
    FROM asset_groups g LEFT JOIN assets a ON a.group_id = g.id
    WHERE g.asset_type = ? GROUP BY g.id ORDER BY g.id DESC
  `).all(assetType);
  const generatedAssetIds = new Set();
  for (const row of database.prepare('SELECT source_asset_ids AS sourceAssetIds FROM project_model_views').all()) {
    try { for (const id of JSON.parse(row.sourceAssetIds || '[]')) generatedAssetIds.add(Number(id)); } catch { /* Ignore legacy invalid JSON. */ }
  }
  for (const row of database.prepare('SELECT source_asset_id AS sourceAssetId FROM project_clothing_white_images').all()) {
    generatedAssetIds.add(Number(row.sourceAssetId));
  }
  const generatedGroupIds = new Set();
  const findGroup = database.prepare('SELECT group_id AS groupId FROM assets WHERE id = ?');
  for (const assetId of generatedAssetIds) {
    const asset = findGroup.get(assetId);
    if (asset) generatedGroupIds.add(Number(asset.groupId));
  }
  return groups.map(group => ({ ...group, hasGeneratedOutput: generatedGroupIds.has(Number(group.id)) }));
}

export function createGroup(assetType, name) {
  const result = database.prepare('INSERT INTO asset_groups (asset_type, name, created_at) VALUES (?, ?, ?)').run(assetType, name, new Date().toISOString());
  return database.prepare('SELECT id, name, asset_type AS assetType, 0 AS assetCount, 0 AS modelCount, 0 AS clothingCount FROM asset_groups WHERE id = ?').get(result.lastInsertRowid);
}

export function renameGroup(id, assetType, name) {
  database.prepare('UPDATE asset_groups SET name = ? WHERE id = ? AND asset_type = ?').run(name, id, assetType);
  return database.prepare('SELECT id, name, asset_type AS assetType FROM asset_groups WHERE id = ?').get(id);
}

export function deleteGroup(id, assetType) {
  return database.prepare('DELETE FROM asset_groups WHERE id = ? AND asset_type = ?').run(id, assetType).changes > 0;
}

export function listAssets(groupId, assetType) {
  return database.prepare(`
    SELECT a.id, a.name, a.asset_type AS assetType, a.mime_type AS mimeType, a.created_at AS createdAt,
      (SELECT v.id FROM asset_versions v WHERE v.asset_id = a.id ORDER BY v.id DESC LIMIT 1) AS latestVersionId,
      (SELECT COUNT(*) FROM asset_versions v WHERE v.asset_id = a.id) AS versionCount
    FROM assets a WHERE a.group_id = ? AND a.asset_type = ? ORDER BY a.id DESC
  `).all(groupId, assetType).map(item => ({ ...item, imageUrl: item.latestVersionId ? `/api/assets/${item.id}/versions/${item.latestVersionId}/image` : `/api/assets/${item.id}/image` }));
}

export function createAsset({ groupId, assetType, name, mimeType, imageData }) {
  const group = database.prepare("SELECT id FROM asset_groups WHERE id = ? AND asset_type = '搭配'").get(groupId);
  if (!group) throw new Error('GROUP_NOT_FOUND');
  const result = database.prepare('INSERT INTO assets (group_id, asset_type, name, mime_type, image_data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(groupId, assetType, name, mimeType, imageData, new Date().toISOString());
  return { id: Number(result.lastInsertRowid), name, mimeType, imageUrl: `/api/assets/${result.lastInsertRowid}/image` };
}

export function getAssetImage(id) {
  return database.prepare('SELECT mime_type AS mimeType, image_data AS imageData FROM assets WHERE id = ?').get(id);
}

export function getAssetForEdit(id, versionId = null) {
  const asset = database.prepare(`
    SELECT id, group_id AS groupId, asset_type AS assetType, name, mime_type AS mimeType, image_data AS imageData
    FROM assets WHERE id = ?
  `).get(id);
  if (!asset) return null;
  if (versionId === 'original') return asset;
  const version = versionId
    ? database.prepare('SELECT id, mime_type AS mimeType, image_data AS imageData FROM asset_versions WHERE id = ? AND asset_id = ?').get(versionId, id)
    : database.prepare('SELECT id, mime_type AS mimeType, image_data AS imageData FROM asset_versions WHERE asset_id = ? ORDER BY id DESC LIMIT 1').get(id);
  return version ? { ...asset, sourceVersionId: version.id, mimeType: version.mimeType, imageData: version.imageData } : asset;
}

export function createAssetVersion({ assetId, prompt, mimeType, imageData }) {
  const result = database.prepare('INSERT INTO asset_versions (asset_id, prompt, mime_type, image_data, created_at) VALUES (?, ?, ?, ?, ?)').run(assetId, prompt, mimeType, imageData, new Date().toISOString());
  const id = Number(result.lastInsertRowid);
  return { id, assetId, prompt, mimeType, imageUrl: `/api/assets/${assetId}/versions/${id}/image` };
}

export function listAssetVersions(assetId) {
  const asset = database.prepare('SELECT id, name, mime_type AS mimeType, created_at AS createdAt FROM assets WHERE id = ?').get(assetId);
  if (!asset) return null;
  const versions = database.prepare('SELECT id, prompt, mime_type AS mimeType, created_at AS createdAt FROM asset_versions WHERE asset_id = ? ORDER BY id ASC').all(assetId);
  return [
    { id: null, assetId, label: '原图', prompt: '', mimeType: asset.mimeType, createdAt: asset.createdAt, imageUrl: `/api/assets/${assetId}/image` },
    ...versions.map((version, index) => ({ ...version, assetId, label: `版本 ${index + 1}`, imageUrl: `/api/assets/${assetId}/versions/${version.id}/image` })),
  ];
}

export function getAssetVersionImage(assetId, versionId) {
  return database.prepare('SELECT mime_type AS mimeType, image_data AS imageData FROM asset_versions WHERE id = ? AND asset_id = ?').get(versionId, assetId);
}

export function deleteAsset(id) {
  return database.prepare('DELETE FROM assets WHERE id = ?').run(id).changes > 0;
}

export function saveProjectModelView({ projectKey, viewType, prompt, sourceAssetIds, mimeType, imageData }) {
  const updatedAt = new Date().toISOString();
  database.prepare(`
    INSERT INTO project_model_views (project_key, view_type, prompt, source_asset_ids, mime_type, image_data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_key, view_type) DO UPDATE SET prompt=excluded.prompt, source_asset_ids=excluded.source_asset_ids,
      mime_type=excluded.mime_type, image_data=excluded.image_data, updated_at=excluded.updated_at
  `).run(projectKey, viewType, prompt, JSON.stringify(sourceAssetIds), mimeType, imageData, updatedAt);
  return { viewType, updatedAt, imageUrl: `/api/project/model-four-view/${encodeURIComponent(viewType)}/image?projectKey=${encodeURIComponent(projectKey)}` };
}

export function replaceProjectModelSheet({ projectKey, prompt, sourceAssetIds, mimeType, imageData }) {
  const updatedAt = new Date().toISOString();
  database.exec('BEGIN');
  try {
    database.prepare('DELETE FROM project_model_views WHERE project_key = ?').run(projectKey);
    database.prepare('DELETE FROM project_model_view_versions WHERE project_key = ?').run(projectKey);
    database.prepare('INSERT INTO project_model_views (project_key, view_type, prompt, source_asset_ids, mime_type, image_data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(projectKey, 'sheet', prompt, JSON.stringify(sourceAssetIds), mimeType, imageData, updatedAt);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return { viewType: 'sheet', updatedAt, imageUrl: `/api/project/model-four-view/sheet/image?projectKey=${encodeURIComponent(projectKey)}` };
}

export function listProjectModelViews(projectKey) {
  return database.prepare(`
    SELECT p.view_type AS viewType, p.updated_at AS updatedAt,
      (SELECT v.id FROM project_model_view_versions v WHERE v.project_key = p.project_key ORDER BY v.id DESC LIMIT 1) AS latestVersionId,
      (SELECT COUNT(*) FROM project_model_view_versions v WHERE v.project_key = p.project_key) AS versionCount
    FROM project_model_views p WHERE p.project_key = ?
  `).all(projectKey).map(view => ({ ...view, imageUrl: view.latestVersionId ? `/api/project/model-four-view/versions/${view.latestVersionId}/image?projectKey=${encodeURIComponent(projectKey)}` : `/api/project/model-four-view/${encodeURIComponent(view.viewType)}/image?projectKey=${encodeURIComponent(projectKey)}` }));
}

export function getProjectModelViewImage(projectKey, viewType) {
  return database.prepare('SELECT mime_type AS mimeType, image_data AS imageData FROM project_model_views WHERE project_key = ? AND view_type = ?').get(projectKey, viewType);
}

export function getProjectModelViewForEdit(projectKey, versionId = null) {
  const original = database.prepare("SELECT mime_type AS mimeType, image_data AS imageData FROM project_model_views WHERE project_key = ? AND view_type = 'sheet'").get(projectKey);
  if (!original) return null;
  if (versionId === 'original') return original;
  const version = versionId
    ? database.prepare('SELECT id, mime_type AS mimeType, image_data AS imageData FROM project_model_view_versions WHERE id = ? AND project_key = ?').get(versionId, projectKey)
    : database.prepare('SELECT id, mime_type AS mimeType, image_data AS imageData FROM project_model_view_versions WHERE project_key = ? ORDER BY id DESC LIMIT 1').get(projectKey);
  return version || original;
}

export function createProjectModelViewVersion({ projectKey, prompt, mimeType, imageData }) {
  const createdAt = new Date().toISOString();
  const result = database.prepare('INSERT INTO project_model_view_versions (project_key, prompt, mime_type, image_data, created_at) VALUES (?, ?, ?, ?, ?)').run(projectKey, prompt, mimeType, imageData, createdAt);
  const id = Number(result.lastInsertRowid);
  return { id, label: '', prompt, createdAt, imageUrl: `/api/project/model-four-view/versions/${id}/image?projectKey=${encodeURIComponent(projectKey)}` };
}

export function listProjectModelViewVersions(projectKey) {
  const original = database.prepare("SELECT updated_at AS createdAt FROM project_model_views WHERE project_key = ? AND view_type = 'sheet'").get(projectKey);
  if (!original) return null;
  const versions = database.prepare('SELECT id, prompt, created_at AS createdAt FROM project_model_view_versions WHERE project_key = ? ORDER BY id ASC').all(projectKey);
  return [
    { id: null, label: '原图', prompt: '', createdAt: original.createdAt, imageUrl: `/api/project/model-four-view/sheet/image?projectKey=${encodeURIComponent(projectKey)}` },
    ...versions.map((version, index) => ({ ...version, label: `版本 ${index + 1}`, imageUrl: `/api/project/model-four-view/versions/${version.id}/image?projectKey=${encodeURIComponent(projectKey)}` })),
  ];
}

export function getProjectModelViewVersionImage(projectKey, versionId) {
  return database.prepare('SELECT mime_type AS mimeType, image_data AS imageData FROM project_model_view_versions WHERE project_key = ? AND id = ?').get(projectKey, versionId);
}

export function deleteProjectModelViewVersion(projectKey, versionId) {
  const result = database.prepare('DELETE FROM project_model_view_versions WHERE project_key = ? AND id = ?').run(projectKey, versionId);
  return result.changes > 0;
}

export function replaceProjectClothingWhiteImage({ projectKey, sourceAssetIds, sourceAssetNames, prompt, mimeType, imageData }) {
  const updatedAt = new Date().toISOString();
  database.exec('BEGIN');
  try {
    database.prepare('DELETE FROM project_clothing_white_images WHERE project_key = ?').run(projectKey);
    database.prepare('INSERT INTO project_clothing_white_images (project_key, source_asset_id, source_asset_name, prompt, mime_type, image_data, updated_at) VALUES (?, 0, ?, ?, ?, ?, ?)')
      .run(projectKey, JSON.stringify({ ids: sourceAssetIds, names: sourceAssetNames }), prompt, mimeType, imageData, updatedAt);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  const saved = database.prepare('SELECT id FROM project_clothing_white_images WHERE project_key = ?').get(projectKey);
  return { id: Number(saved.id), sourceAssetIds, sourceAssetNames, updatedAt, imageUrl: `/api/project/clothing-white-background/${saved.id}/image?projectKey=${encodeURIComponent(projectKey)}` };
}

export function listProjectClothingWhiteImages(projectKey) {
  return database.prepare(`
    SELECT id, source_asset_name AS sourceInfo, updated_at AS updatedAt
    FROM project_clothing_white_images WHERE project_key = ? ORDER BY id ASC
  `).all(projectKey).map(item => {
    let sourceAssetNames = [];
    let sourceAssetIds = [];
    try {
      const sourceInfo = JSON.parse(item.sourceInfo);
      sourceAssetNames = sourceInfo.names || [];
      sourceAssetIds = sourceInfo.ids || [];
    } catch {
      sourceAssetNames = item.sourceInfo ? [item.sourceInfo] : [];
    }
    return { id: item.id, sourceAssetIds, sourceAssetNames, updatedAt: item.updatedAt, imageUrl: `/api/project/clothing-white-background/${item.id}/image?projectKey=${encodeURIComponent(projectKey)}` };
  });
}

export function getProjectClothingWhiteImage(projectKey, id) {
  return database.prepare('SELECT mime_type AS mimeType, image_data AS imageData FROM project_clothing_white_images WHERE project_key = ? AND id = ?').get(projectKey, id);
}

export function saveProjectDressedModelImage({ projectKey, sourceModelVersionId, sourceClothingImageId, scene, outputPath, prompt, mimeType, imageData }) {
  const updatedAt = new Date().toISOString();
  const result = database.prepare(`
    INSERT INTO project_dressed_model_images (project_key, source_model_version_id, source_clothing_image_id, scene, output_path, prompt, mime_type, image_data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(projectKey, String(sourceModelVersionId), sourceClothingImageId, scene, outputPath, prompt, mimeType, imageData, updatedAt);
  const id = Number(result.lastInsertRowid);
  return { id, scene, outputPath, updatedAt, imageUrl: `/api/project/dressed-model/image?projectKey=${encodeURIComponent(projectKey)}&imageId=${id}` };
}

export function getProjectDressedModel(projectKey) {
  return listProjectDressedModels(projectKey)[0] || null;
}

export function listProjectDressedModels(projectKey) {
  return database.prepare('SELECT id, source_model_version_id AS sourceModelVersionId, source_clothing_image_id AS sourceClothingImageId, scene, output_path AS outputPath, updated_at AS updatedAt FROM project_dressed_model_images WHERE project_key = ? ORDER BY id DESC').all(projectKey)
    .map(item => ({ ...item, imageUrl: `/api/project/dressed-model/image?projectKey=${encodeURIComponent(projectKey)}&imageId=${item.id}` }));
}

export function getProjectDressedModelImage(projectKey, imageId = null) {
  return imageId
    ? database.prepare('SELECT id, mime_type AS mimeType, image_data AS imageData FROM project_dressed_model_images WHERE project_key = ? AND id = ?').get(projectKey, imageId)
    : database.prepare('SELECT id, mime_type AS mimeType, image_data AS imageData FROM project_dressed_model_images WHERE project_key = ? ORDER BY id DESC LIMIT 1').get(projectKey);
}

export function createProjectVideoTask({ projectKey, dressedModelImageId, shotIndex, shotName, prompt, remoteTaskId, archivePath }) {
  const createdAt = new Date().toISOString();
  const result = database.prepare('INSERT INTO project_video_tasks (project_key, dressed_model_image_id, shot_index, shot_name, prompt, remote_task_id, archive_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(projectKey, dressedModelImageId, shotIndex, shotName, prompt, remoteTaskId, archivePath, createdAt, createdAt);
  return getProjectVideoTask(Number(result.lastInsertRowid));
}

export function getProjectVideoTask(id) {
  const task = database.prepare('SELECT id, project_key AS projectKey, dressed_model_image_id AS dressedModelImageId, shot_index AS shotIndex, shot_name AS shotName, prompt, remote_task_id AS remoteTaskId, status, output_path AS outputPath, error_message AS errorMessage, archive_path AS archivePath, created_at AS createdAt, updated_at AS updatedAt FROM project_video_tasks WHERE id = ?').get(id);
  return task ? { ...task, videoUrl: task.outputPath ? `/api/project/videos/${task.id}/file` : null } : null;
}

export function listProjectVideoTasks(projectKey) {
  return database.prepare('SELECT id, project_key AS projectKey, dressed_model_image_id AS dressedModelImageId, shot_index AS shotIndex, shot_name AS shotName, prompt, remote_task_id AS remoteTaskId, status, output_path AS outputPath, error_message AS errorMessage, created_at AS createdAt, updated_at AS updatedAt FROM project_video_tasks WHERE project_key = ? ORDER BY shot_index ASC, id DESC').all(projectKey).map(task => ({ ...task, videoUrl: task.outputPath ? `/api/project/videos/${task.id}/file` : null }));
}

export function updateProjectVideoTask(id, { status, outputPath, errorMessage }) {
  database.prepare('UPDATE project_video_tasks SET status = ?, output_path = COALESCE(?, output_path), error_message = COALESCE(?, error_message), updated_at = ? WHERE id = ?').run(status, outputPath ?? null, errorMessage ?? null, new Date().toISOString(), id);
  return getProjectVideoTask(id);
}
