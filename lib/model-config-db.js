import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dataDirectory = path.join(process.cwd(), 'data');
const databasePath = path.join(dataDirectory, 'model-config.sqlite');
const localKeyPath = path.join(dataDirectory, '.model-config-key');

mkdirSync(dataDirectory, { recursive: true });

const databaseGlobal = globalThis;
export const database = databaseGlobal.__fashionModelConfigDatabase || new DatabaseSync(databasePath);
if (process.env.NODE_ENV !== 'production') {
  databaseGlobal.__fashionModelConfigDatabase = database;
}
database.exec('PRAGMA busy_timeout = 5000');
database.exec('PRAGMA foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS model_configs (
    model_type TEXT PRIMARY KEY,
    base_url TEXT NOT NULL,
    model_name TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )
`);

const seed = database.prepare(`
  INSERT INTO model_configs (model_type, base_url, model_name, enabled, updated_at)
  VALUES (?, ?, ?, 1, ?)
  ON CONFLICT(model_type) DO NOTHING
`);
const seededAt = new Date().toISOString();
seed.run('multimodal', 'https://api.openai.com/v1', 'gpt-5.4', seededAt);
seed.run('gpt-image-2', 'https://api.openai.com/v1', 'gpt-image-2', seededAt);
seed.run('gpt-image-2-text', 'https://api.openai.com/v1/images/generations', 'gpt-image-2', seededAt);
seed.run('seedance', 'https://ark.cn-beijing.volces.com/api/v3', 'doubao-seedance-1-0-pro-fast-251015', seededAt);

function encryptionKey() {
  if (process.env.MODEL_CONFIG_SECRET) {
    return createHash('sha256').update(process.env.MODEL_CONFIG_SECRET).digest();
  }
  if (!existsSync(localKeyPath)) {
    writeFileSync(localKeyPath, randomBytes(32), { mode: 0o600 });
  }
  return readFileSync(localKeyPath);
}

function encrypt(value) {
  if (!value) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString('base64url')).join('.');
}

function decrypt(value) {
  if (!value) return '';
  const [ivValue, tagValue, encryptedValue] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}

export function getModelConfig(modelType) {
  const row = database.prepare('SELECT * FROM model_configs WHERE model_type = ?').get(modelType);
  if (!row) return null;
  return {
    modelType: row.model_type,
    baseUrl: row.base_url,
    modelName: row.model_name,
    enabled: Boolean(row.enabled),
    hasApiKey: Boolean(row.api_key_encrypted),
    updatedAt: row.updated_at,
  };
}

export function saveModelConfig({ modelType, baseUrl, modelName, apiKey, enabled }) {
  const current = database.prepare('SELECT api_key_encrypted FROM model_configs WHERE model_type = ?').get(modelType);
  const encryptedKey = apiKey ? encrypt(apiKey) : (current?.api_key_encrypted || '');
  const updatedAt = new Date().toISOString();
  database.prepare(`
    INSERT INTO model_configs (model_type, base_url, model_name, api_key_encrypted, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_type) DO UPDATE SET
      base_url = excluded.base_url,
      model_name = excluded.model_name,
      api_key_encrypted = excluded.api_key_encrypted,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run(modelType, baseUrl, modelName, encryptedKey, enabled ? 1 : 0, updatedAt);
  return getModelConfig(modelType);
}

export function getModelConnection(modelType) {
  const row = database.prepare('SELECT * FROM model_configs WHERE model_type = ?').get(modelType);
  if (!row) return null;
  return {
    modelType: row.model_type,
    baseUrl: row.base_url,
    modelName: row.model_name,
    apiKey: decrypt(row.api_key_encrypted),
    enabled: Boolean(row.enabled),
  };
}
