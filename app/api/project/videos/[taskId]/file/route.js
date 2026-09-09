import { getProjectVideoTask } from '../../../../../../lib/assets-db';
import { readFileSync, existsSync } from 'node:fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const task = getProjectVideoTask(Number(params.taskId));
  if (!task?.outputPath || !existsSync(task.outputPath)) return new Response('Not found', { status: 404 });
  return new Response(readFileSync(task.outputPath), { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store' } });
}
