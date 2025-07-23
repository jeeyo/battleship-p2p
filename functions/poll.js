// Cloudflare Pages Function: /poll
export async function onRequestGet(context) {
    const { request, env } = context;
    
    try {
        const url = new URL(request.url);
        const roomCode = url.searchParams.get('roomCode');
        const lastTimestamp = parseInt(url.searchParams.get('lastTimestamp')) || 0;
        const requesterId = url.searchParams.get('requesterId');
        
        if (!roomCode) {
            return new Response(JSON.stringify({ error: 'Room code required' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!requesterId) {
            return new Response(JSON.stringify({ error: 'Requester ID required' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Verify room exists
        const roomData = await env.ROOMS.get(roomCode);
        if (!roomData) {
            return new Response(JSON.stringify({ error: 'Room not found' }), { 
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Get messages from KV
        const messagesData = await env.MESSAGES.get(roomCode);
        const allMessages = messagesData ? JSON.parse(messagesData) : [];
        
        // Filter messages newer than lastTimestamp and not sent by the requester
        const newMessages = allMessages.filter(msg => 
            msg.timestamp > lastTimestamp && msg.senderId !== requesterId
        );
        
        return new Response(JSON.stringify(newMessages), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ code: error.code,error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 