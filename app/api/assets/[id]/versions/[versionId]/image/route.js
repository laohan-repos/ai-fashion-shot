import { getAssetVersionImage } from '../../../../../../../lib/assets-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const image = getAssetVersionImage(Number(params.id), Number(params.versionId));
  if (!image) return new Response('Not found', { status: 404 });
  return new Response(image.imageData, { headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, max-age=3600' } });
}

