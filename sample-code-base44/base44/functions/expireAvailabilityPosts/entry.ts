import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const posts = await base44.asServiceRole.entities.AvailabilityPost.filter({ status: "active" });
    const now = new Date();
    const toExpire = posts.filter(p => p.expires_at && new Date(p.expires_at) < now);

    await Promise.all(
      toExpire.map(p => base44.asServiceRole.entities.AvailabilityPost.update(p.id, { status: "expired" }))
    );

    return Response.json({ expired: toExpire.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});