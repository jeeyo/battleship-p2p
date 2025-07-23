// Cloudflare Pages Function: /signal
export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        const roomCode = body.roomCode;
        const senderId = body.senderId;
        
        if (!roomCode) {
            return new Response(JSON.stringify({ error: 'Room code required' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!senderId) {
            return new Response(JSON.stringify({ error: 'Sender ID required' }), { 
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
        
        // Get existing messages
        const messagesData = await env.MESSAGES.get(roomCode);
        const messages = messagesData ? JSON.parse(messagesData) : [];
        
        // Add the signaling message with sender identification
        messages.push({
            ...body,
            senderId: senderId,
            timestamp: Date.now()
        });
        
        // Keep only recent messages (last 50)
        if (messages.length > 50) {
            messages.splice(0, messages.length - 50);
        }
        
        // Store back to KV
        await env.MESSAGES.put(roomCode, JSON.stringify(messages), {
            expirationTtl: 2 * 60 * 60 // 2 hours
        });
        
        return new Response(JSON.stringify({
            success: true,
            message: 'Signal sent successfully'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ code: error.code,error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 