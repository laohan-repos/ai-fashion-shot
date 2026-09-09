import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getProjectVideoTask, updateProjectVideoTask } from '../../../../../lib/assets-db';
import { getModelConnection } from '../../../../../lib/model-config-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tasksEndpoint(configuredUrl, taskId) {
  const url = new URL(configuredUrl);
  const suffix = `/contents/generations/tasks/${encodeURIComponent(taskId)}`;
  if (!url.pathname.includes('/contents/generations/tasks')) url.pathname = `${url.pathname.replace(/\/$/, '')}${suffix}`;
  else url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(taskId)}`;
  return url.toString();
}

function videoUrl(payload) {
  return payload?.content?.video_url || payload?.content?.videoUrl || payload?.content?.[0]?.video_url || payload?.content?.[0]?.videoUrl || payload?.data?.[0]?.video_url || payload?.data?.[0]?.videoUrl || payload?.video_url || payload?.videoUrl;
}

export async function GET(request, { params }) {
  const task = getProjectVideoTask(Number(params.taskId));
  if (!task) return NextResponse.json({ error: '视频任务不存在' }, { status: 404 });
  if (task.status === 'succeeded' || task.status === 'failed') return NextResponse.json({ task });
  const config = getModelConnection('seedance');
  if (!config?.apiKey) return NextResponse.json({ task, error: 'Seedance 配置不存在' }, { status: 400 });
  try {
    const response = await fetch(tasksEndpoint(config.baseUrl, task.remoteTaskId), { headers: { Authorization: `Bearer ${config.apiKey}` }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
    const status = payload?.status || payload?.data?.status || 'running';
    if (status === 'failed' || status === 'canceled' || status === 'cancelled') {
      const updated = updateProjectVideoTask(task.id, { status: 'failed', errorMessage: payload?.error?.message || payload?.message || 'Seedance 任务失败' });
      return NextResponse.json({ task: updated });
    }
    const remoteUrl = videoUrl(payload);
    if (status === 'succeeded' && remoteUrl) {
      const videoResponse = await fetch(remoteUrl, { signal: AbortSignal.timeout(120000) });
      if (!videoResponse.ok) throw new Error('视频生成成功，但下载视频失败');
      const videoData = Buffer.from(await videoResponse.arrayBuffer());
      const outputDirectory = path.join(process.cwd(), '模特视频');
      mkdirSync(outputDirectory, { recursive: true });
      const outputPath = path.join(outputDirectory, `视频-${task.shotName}-${Date.now()}.mp4`);
      writeFileSync(outputPath, videoData);
      writeFileSync(path.join(task.archivePath, 'response-raw.json'), JSON.stringify(payload, null, 2));
      writeFileSync(path.join(task.archivePath, 'video.url.txt'), `${remoteUrl}\n任务ID：${task.remoteTaskId}\n`);
      writeFileSync(path.join(task.archivePath, 'metadata.json'), JSON.stringify({ bytes: videoData.length, sha256: createHash('sha256').update(videoData).digest('hex'), outputPath, audio: 'silent' }, null, 2));
      const updated = updateProjectVideoTask(task.id, { status: 'succeeded', outputPath });
      return NextResponse.json({ task: updated });
    }
    return NextResponse.json({ task: updateProjectVideoTask(task.id, { status: 'running' }) });
  } catch (error) {
    return NextResponse.json({ task, error: error.message || '读取 Seedance 任务失败' }, { status: 502 });
  }
}
