// Cloudflare Worker for WebRTC Signaling
// This worker handles room creation, joining, and message passing for P2P connections

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        
        // Enable CORS for all requests
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };
        
        // Handle preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        
        try {
            let response;
            
            switch (path) {
                case '/create-room':
                    response = await handleCreateRoom(request);
                    break;
                case '/join-room':
                    response = await handleJoinRoom(request);
                    break;
                case '/signal':
                    response = await handleSignal(request);
                    break;
                case '/poll':
                    response = await handlePoll(request);
                    break;
                default:
                    response = new Response('Not Found', { status: 404 });
            }
            
            // Add CORS headers to response
            Object.entries(corsHeaders).forEach(([key, value]) => {
                response.headers.set(key, value);
            });
            
            return response;
        } catch (error) {
            console.error('Worker error:', error);
            return new Response('Internal Server Error', { 
                status: 500,
                headers: corsHeaders 
            });
        }
    }
};

// In-memory storage for rooms and messages
// Note: In production, you might want to use Durable Objects or KV storage
const rooms = new Map();
const messages = new Map();

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function handleCreateRoom(request) {
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }
    
    const body = await request.json();
    const roomCode = body.roomCode;
    
    if (!roomCode || roomCode.length !== 6) {
        return new Response('Invalid room code', { status: 400 });
    }
    
    // Check if room already exists
    if (rooms.has(roomCode)) {
        return new Response('Room already exists', { status: 409 });
    }
    
    // Create new room
    rooms.set(roomCode, {
        id: roomCode,
        creator: request.headers.get('cf-connecting-ip') || 'unknown',
        participants: 1,
        createdAt: Date.now(),
        status: 'waiting'
    });
    
    // Initialize message queue for room
    messages.set(roomCode, []);
    
    return new Response(JSON.stringify({
        success: true,
        roomCode: roomCode,
        message: 'Room created successfully'
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleJoinRoom(request) {
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }
    
    const body = await request.json();
    const roomCode = body.roomCode;
    
    if (!roomCode || roomCode.length !== 6) {
        return new Response('Invalid room code', { status: 400 });
    }
    
    const room = rooms.get(roomCode);
    if (!room) {
        return new Response('Room not found', { status: 404 });
    }
    
    if (room.participants >= 2) {
        return new Response('Room is full', { status: 409 });
    }
    
    // Update room
    room.participants = 2;
    room.status = 'full';
    
    // Notify other participants that someone joined
    const roomMessages = messages.get(roomCode) || [];
    roomMessages.push({
        type: 'peer-joined',
        timestamp: Date.now()
    });
    messages.set(roomCode, roomMessages);
    
    return new Response(JSON.stringify({
        success: true,
        message: 'Joined room successfully'
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleSignal(request) {
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }
    
    const body = await request.json();
    const roomCode = body.roomCode;
    
    if (!roomCode || !rooms.has(roomCode)) {
        return new Response('Invalid room code', { status: 400 });
    }
    
    // Store the signaling message
    const roomMessages = messages.get(roomCode) || [];
    roomMessages.push({
        ...body,
        timestamp: Date.now()
    });
    
    // Keep only recent messages (last 50)
    if (roomMessages.length > 50) {
        roomMessages.splice(0, roomMessages.length - 50);
    }
    
    messages.set(roomCode, roomMessages);
    
    return new Response(JSON.stringify({
        success: true,
        message: 'Signal sent successfully'
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handlePoll(request) {
    if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
    }
    
    const url = new URL(request.url);
    const roomCode = url.searchParams.get('roomCode');
    const lastTimestamp = parseInt(url.searchParams.get('lastTimestamp')) || 0;
    
    if (!roomCode || !rooms.has(roomCode)) {
        return new Response('Invalid room code', { status: 400 });
    }
    
    const roomMessages = messages.get(roomCode) || [];
    
    // Filter messages newer than lastTimestamp
    const newMessages = roomMessages.filter(msg => msg.timestamp > lastTimestamp);
    
    return new Response(JSON.stringify(newMessages), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// Cleanup old rooms periodically (this would need to be handled differently in production)
// For demonstration purposes only
function cleanupOldRooms() {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    for (const [roomCode, room] of rooms.entries()) {
        if (now - room.createdAt > maxAge) {
            rooms.delete(roomCode);
            messages.delete(roomCode);
        }
    }
}

// Simple periodic cleanup (note: this won't work in Cloudflare Workers without scheduled events)
// setInterval(cleanupOldRooms, 5 * 60 * 1000); // Every 5 minutes 