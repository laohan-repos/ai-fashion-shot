import { NextResponse } from 'next/server';
import { getModelConnection } from '../../../../lib/model-config-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedTypes = new Set(['multimodal', 'gpt-image-2', 'gpt-image-2-text', 'seedance']);

function modelsEndpoint(configuredUrl) {
  const url = new URL(configuredUrl);
  const versionMatch = url.pathname.match(/^(.*\/v\d+)(?:\/.*)?$/);
  const apiPath = versionMatch ? versionMatch[1] : url.pathname.replace(/\/$/, '');
  url.pathname = `${apiPath}/models`.replace(/\/+/g, '/');
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function POST(request) {
  const startedAt = Date.now();
  try {
    const body = await request.json();
    if (!allowedTypes.has(body.modelType)) {
      return NextResponse.json({ ok: false, message: '无效的模型类型' }, { status: 400 });
    }
    const stored = getModelConnection(body.modelType);
    const baseUrl = body.baseUrl?.trim() || stored?.baseUrl;
    const modelName = body.modelName?.trim() || stored?.modelName;
    const apiKey = body.apiKey?.trim() || stored?.apiKey;
    if (!baseUrl || !modelName || !apiKey) {
      return NextResponse.json({ ok: false, message: '请先填写并保存完整的连接配置' }, { status: 400 });
    }

    const response = await fetch(modelsEndpoint(baseUrl), {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const latency = Date.now() - startedAt;
    let payload = null;
    try { payload = await response.json(); } catch { /* Some compatible services return plain text. */ }

    if (!response.ok) {
      const remoteMessage = payload?.error?.message || payload?.message;
      const message = response.status === 401 || response.status === 403
        ? '认证失败，请检查 API Key'
        : `连接失败（HTTP ${response.status}）${remoteMessage ? `：${remoteMessage}` : ''}`;
      return NextResponse.json({ ok: false, message, latency }, { status: 502 });
    }

    const models = Array.isArray(payload?.data) ? payload.data : [];
    const modelFound = models.length ? models.some(item => item.id === modelName) : null;
    return NextResponse.json({
      ok: true,
      latency,
      modelFound,
      message: modelFound === false ? `连接成功，但模型列表中未发现 ${modelName}` : '连接成功，认证有效',
    });
  } catch (error) {
    const timeout = error?.name === 'TimeoutError';
    return NextResponse.json({ ok: false, message: timeout ? '连接超时，请检查 API 地址或网络' : '无法连接到模型服务', latency: Date.now() - startedAt }, { status: 502 });
  }
}
