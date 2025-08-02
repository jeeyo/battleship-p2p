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
        
        // Efficient filtering with early termination for large message lists
        const newMessages = [];
        let lastSequence = 0;
        
        // Iterate in reverse to find messages more efficiently (newer messages are at the end)
        for (let i = allMessages.length - 1; i >= 0; i--) {
            const msg = allMessages[i];
            
            // Skip messages that are too old (optimization)
            if (msg.timestamp <= lastTimestamp) {
                break;
            }
            
            // Skip messages from the requester
            if (msg.senderId === requesterId) {
                continue;
            }
            
            newMessages.unshift(msg);
            lastSequence = Math.max(lastSequence, msg.sequence || 0);
            
            // Limit response size to prevent memory issues
            if (newMessages.length >= 20) {
                break;
            }
        }
        
        return new Response(JSON.stringify({
            messages: newMessages,
            lastSequence: lastSequence,
            hasMore: newMessages.length >= 20
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ code: error.code,error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 