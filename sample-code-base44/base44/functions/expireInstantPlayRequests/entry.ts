import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const all = await base44.asServiceRole.entities.InstantPlayRequest.filter({ status: 'waiting' });
  const now = Date.now();
  let expired = 0;

  for (const r of all) {
    if (r.expires_at && new Date(r.expires_at).getTime() < now) {
      await base44.asServiceRole.entities.InstantPlayRequest.update(r.id, { status: 'expired' });
      expired++;
    }
  }

  // Also expire matched-but-unconfirmed requests older than 15 minutes
  const matched = await base44.asServiceRole.entities.InstantPlayRequest.filter({ status: 'matched' });
  for (const r of matched) {
    if (r.expires_at && new Date(r.expires_at).getTime() < now) {
      await base44.asServiceRole.entities.InstantPlayRequest.update(r.id, { status: 'expired' });
      expired++;
    }
  }

  return Response.json({ expired });
});