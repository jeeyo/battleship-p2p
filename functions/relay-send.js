// Cloudflare Pages Function: /relay-send
// Sends gameplay payloads via edge relay (KV queues) when P2P is unavailable
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { roomCode, role, token, senderId, payload } = body || {};

    if (!roomCode || (role !== 'initiator' && role !== 'joiner') || !senderId) {
      return new Response(JSON.stringify({ error: 'roomCode, role, senderId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify room exists and optional token validation
    const roomData = await env.ROOMS.get(roomCode);
    if (!roomData) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const room = JSON.parse(roomData);
    const expected = role === 'initiator' ? room?.tokens?.initiator : room?.tokens?.joiner;
    if (expected && token && expected !== token) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const targetKey = role === 'initiator' ? `${roomCode}_relay_joiner` : `${roomCode}_relay_initiator`;
    const existingData = await env.MESSAGES.get(targetKey);
    const queue = existingData ? JSON.parse(existingData) : [];

    const timestamp = Date.now();
    const lastSequence = queue.length > 0 ? Math.max(...queue.map((m) => m.sequence || 0)) : 0;
    const messageId = `${senderId}_${timestamp}_${Math.random().toString(36).slice(2, 6)}`;

    const message = {
      type: 'relay-data',
      senderId,
      payload, // expected to be JSON-serializable
      timestamp,
      sequence: lastSequence + 1,
      messageId,
    };

    queue.push(message);

    // Clean and persist
    const oneHourAgo = timestamp - 60 * 60 * 1000;
    let filtered = queue.filter((m) => m.timestamp > oneHourAgo);
    if (filtered.length > 200) filtered = filtered.slice(-100);

    await env.MESSAGES.put(targetKey, JSON.stringify(filtered), { expirationTtl: 2 * 60 * 60 });

    return new Response(JSON.stringify({ success: true, messageId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'unknown' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
