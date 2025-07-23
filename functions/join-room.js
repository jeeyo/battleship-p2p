// Cloudflare Pages Function: /join-room
export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        const roomCode = body.roomCode;
        
        if (!roomCode || roomCode.length !== 6) {
            return new Response(JSON.stringify({ error: 'Invalid room code' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Get room from KV
        const roomData = await env.ROOMS.get(roomCode);
        if (!roomData) {
            return new Response(JSON.stringify({ error: 'Room not found' }), { 
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const room = JSON.parse(roomData);
        if (room.participants >= 2) {
            return new Response(JSON.stringify({ error: 'Room is full' }), { 
                status: 409,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Update room
        room.participants = 2;
        room.status = 'full';
        
        // Save updated room to KV
        await env.ROOMS.put(roomCode, JSON.stringify(room), {
            expirationTtl: 2 * 60 * 60 // 2 hours
        });
        
        // Add peer-joined message
        const messagesData = await env.MESSAGES.get(roomCode);
        const messages = messagesData ? JSON.parse(messagesData) : [];
        
        messages.push({
            type: 'peer-joined',
            timestamp: Date.now()
        });
        
        // Keep only recent messages (last 50)
        if (messages.length > 50) {
            messages.splice(0, messages.length - 50);
        }
        
        await env.MESSAGES.put(roomCode, JSON.stringify(messages), {
            expirationTtl: 2 * 60 * 60 // 2 hours
        });
        
        return new Response(JSON.stringify({
            success: true,
            message: 'Joined room successfully'
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