// Cloudflare Pages Function: /metrics
// Receives lightweight client telemetry. For now, it logs and returns 200.
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const payload = await request.json().catch(() => ({}));

    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const roomCode = typeof payload.roomCode === 'string' ? payload.roomCode : 'unknown';
    const clientId = typeof payload.clientId === 'string' ? payload.clientId : 'unknown';
    const event = typeof payload.event === 'string' ? payload.event : 'unknown_event';

    // Compose a compact record
    const record = {
      t: now.toISOString(),
      e: event,
      r: roomCode,
      c: clientId,
      d: payload, // retain full payload for flexibility
    };

    // Use append-only list in KV per-day; keep size bounded
    const kvKey = `metrics:${dateKey}`;
    const existing = await env.MESSAGES.get(kvKey);
    let list = [];
    if (existing) {
      try { list = JSON.parse(existing); } catch { list = []; }
    }
    list.push(record);
    // Keep up to last 2000 entries per day
    if (list.length > 2000) list = list.slice(-2000);
    await env.MESSAGES.put(kvKey, JSON.stringify(list), { expirationTtl: 7 * 24 * 60 * 60 });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
