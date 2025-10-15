// Cloudflare Pages Function: /relay-poll
// Polls for gameplay payloads delivered via edge relay queues
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const roomCode = url.searchParams.get('roomCode');
    const lastTimestamp = parseInt(url.searchParams.get('lastTimestamp')) || 0;
    const requesterId = url.searchParams.get('requesterId');
    const role = url.searchParams.get('role'); // 'initiator' | 'joiner'
    const token = url.searchParams.get('token');

    if (!roomCode || !requesterId || (role !== 'initiator' && role !== 'joiner')) {
      return new Response(JSON.stringify({ error: 'roomCode, requesterId, role required' }), {
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

    if (token) {
      try {
        const room = JSON.parse(roomData);
        const expected = role === 'initiator' ? room?.tokens?.initiator : room?.tokens?.joiner;
        if (expected && expected !== token) {
          return new Response(JSON.stringify({ error: 'Invalid token' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch {}
    }

    const sourceKey = role === 'initiator' ? `${roomCode}_relay_initiator` : `${roomCode}_relay_joiner`;
    const data = await env.MESSAGES.get(sourceKey);
    const all = data ? JSON.parse(data) : [];

    const newMessages = [];
    for (let i = all.length - 1; i >= 0; i--) {
      const msg = all[i];
      if (msg.timestamp <= lastTimestamp) break;
      if (msg.senderId === requesterId) continue; // don't echo back
      newMessages.unshift(msg);
      if (newMessages.length >= 30) break; // response cap
    }

    return new Response(
      JSON.stringify({ messages: newMessages, lastTimestamp: Date.now(), hasMore: newMessages.length >= 30 }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'unknown' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
