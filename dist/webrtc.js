class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.controlChannel = null; // reliable ordered
        this.inputsChannel = null;  // unreliable, low-latency
        this.isInitiator = false;
        this.roomCode = null;
        
        // Generate unique client ID for this session
        this.clientId = this.generateClientId();

        // Configure signaling URL based on environment
        this.signalingUrl = this.getSignalingUrl();

        this.callbacks = {
            onConnectionStateChange: null,
            onDataReceived: null,
            onRoomCreated: null,
            onRoomJoined: null,
            onPeerJoined: null,
            onError: null
        };

        // Will be initialized via /turn-credentials endpoint
        this.configuration = { iceServers: [] };

        // Connectivity/health
        this.connectStartAt = 0;
        this.connectedAt = 0;
        this.lastPongAt = 0;
        this.pingIntervalMs = 2000;
        this.pingTimeoutMs = 8000;
        this.pingTimer = null;
        this.iceRestartAttempts = 0;
        this.maxIceRestartAttempts = 3;
        this.nextIceRestartDelayMs = 1000;
        this.iceRestartTimer = null;

        // WS signaling
        this.ws = null;
        this.wsReady = false;

        // Message queue system
        this.messageQueue = [];
        this.isProcessingQueue = false;
        this.queueProcessingInterval = 100; // WS can handle faster cadence
        this.maxQueueSize = 50; // Prevent memory issues
        this.messageRetryMap = new Map(); // Track retry counts for failed messages
    }

    // Fetch ICE servers from worker endpoint
    async loadIceServers() {
        try {
            const response = await fetch(`${this.signalingUrl}/turn-credentials`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (Array.isArray(data.iceServers)) {
                this.configuration = { iceServers: data.iceServers };
            } else {
                this.configuration = {
                    iceServers: [
                        { urls: 'stun:stun.cloudflare.com:3478' },
                        { urls: 'stun:stun.l.google.com:19302' }
                    ]
                };
            }
        } catch (e) {
            console.warn('Failed to load ICE servers, using fallback STUN only', e);
            this.configuration = {
                iceServers: [
                    { urls: 'stun:stun.cloudflare.com:3478' },
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            };
        }
    }

    // Queue management methods

    // Add message to queue
    queueSignalingMessage(message) {
        // Generate unique message ID if not provided
        const messageId = message.messageId || `${this.clientId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        // Prevent queue from growing too large
        if (this.messageQueue.length >= this.maxQueueSize) {
            console.warn('Signaling message queue full, dropping oldest message');
            this.messageQueue.shift();
        }

        // Add enhanced metadata for processing
        const queuedMessage = {
            ...message,
            messageId: messageId,
            queueTimestamp: Date.now(),
            retryCount: 0,
            maxRetries: 3
        };

        this.messageQueue.push(queuedMessage);

        // Start processing if not already running
        if (!this.isProcessingQueue) {
            this.startQueueProcessing();
        }
    }

    // Start processing the message queue
    startQueueProcessing() {
        if (this.isProcessingQueue) return;

        this.isProcessingQueue = true;
        this.processNextMessage();
    }

    // Process the next message in the queue
    async processNextMessage() {
        if (this.messageQueue.length === 0) {
            this.isProcessingQueue = false;
            return;
        }

        const message = this.messageQueue.shift();

        try {
            const response = await this.sendSignalingMessageDirect(message);
            
            // Handle successful response
            if (response && response.isDuplicate) {
                console.log('Message was already processed (duplicate):', message.messageId);
            }
            
            // Remove from retry tracking on success
            this.messageRetryMap.delete(message.messageId);
            
        } catch (error) {
            console.error('Error processing queued signaling message:', error);
            
            // Retry logic
            message.retryCount = (message.retryCount || 0) + 1;
            
            if (message.retryCount < message.maxRetries) {
                console.log(`Retrying message ${message.messageId}, attempt ${message.retryCount + 1}`);
                
                // Exponential backoff: add back to queue with delay
                setTimeout(() => {
                    this.messageQueue.unshift(message);
                }, Math.pow(2, message.retryCount) * 1000);
                
            } else {
                console.error(`Failed to send message ${message.messageId} after ${message.maxRetries} attempts`);
                this.messageRetryMap.delete(message.messageId);
                
                if (this.callbacks.onError) {
                    this.callbacks.onError(`Failed to send signaling message after ${message.maxRetries} attempts: ${error.message}`);
                }
            }
        }

        // Schedule next message processing
        setTimeout(() => {
            this.processNextMessage();
        }, this.queueProcessingInterval);
    }

    // Stop queue processing
    stopQueueProcessing() {
        this.isProcessingQueue = false;
        this.messageQueue = []; // Clear remaining messages
        this.messageRetryMap.clear(); // Clear retry tracking
    }

    // Determine signaling URL based on environment
    getSignalingUrl() {
        // Check if running in development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // Prefer standalone worker dev on 8787 when available
            return `http://${window.location.hostname}:8787`;
        }

        // Production - replace with your actual worker URL
        return `https://${window.location.hostname}`;
    }

    // Initialize peer connection
    initializePeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.configuration);

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    roomCode: this.roomCode
                });
            } else if (event.candidate) {
                console.log('Ignoring additional ICE candidate');
            }
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.callbacks.onConnectionStateChange) {
                this.callbacks.onConnectionStateChange(this.peerConnection.connectionState);
            }

            // Stop polling if connection is closed or failed
            if (['closed', 'failed'].includes(this.peerConnection.connectionState)) {
                this.stopPolling();
            }
        };

        // Handle incoming data channels
        this.peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            if (channel.label === 'control') {
                this.setupControlChannel(channel);
            } else if (channel.label === 'inputs') {
                this.setupInputsChannel(channel);
            } else {
                // Backward compatibility with single-channel builds
                this.setupControlChannel(channel);
            }
        };

        // Handle ICE connection state
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', this.peerConnection.iceConnectionState);

            if (this.peerConnection.iceConnectionState === 'connected') {
                this.stopPolling(); // Stop polling once P2P connection is established
            }
        };
    }

    // Setup reliable control channel
    setupControlChannel(channel) {
        this.controlChannel = channel;
        this.controlChannel.onopen = () => {
            console.log('Control channel opened');
            this.onAnyChannelOpened();
        };
        this.controlChannel.onclose = () => {
            console.log('Control channel closed');
            this.onAnyChannelClosed();
        };
        this.controlChannel.onmessage = (event) => {
            this.handleIncomingMessage(event, 'control');
        };
        this.controlChannel.onerror = (error) => {
            console.error('Control channel error:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('Control channel error: ' + error);
            }
        };
    }

    // Setup unreliable inputs/heartbeat channel
    setupInputsChannel(channel) {
        this.inputsChannel = channel;
        this.inputsChannel.onopen = () => {
            console.log('Inputs channel opened');
            this.onAnyChannelOpened();
        };
        this.inputsChannel.onclose = () => {
            console.log('Inputs channel closed');
            this.onAnyChannelClosed();
        };
        this.inputsChannel.onmessage = (event) => {
            this.handleIncomingMessage(event, 'inputs');
        };
        this.inputsChannel.onerror = (error) => {
            console.error('Inputs channel error:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('Inputs channel error: ' + error);
            }
        };
    }

    onAnyChannelOpened() {
        this.stopPolling();
        if (this.callbacks.onConnectionStateChange) {
            this.callbacks.onConnectionStateChange('connected');
        }
        if (!this.pingTimer) {
            this.startKeepalives();
        }
        if (!this.connectedAt && this.connectStartAt) {
            this.connectedAt = Date.now();
            this.postMetrics('webrtc_connected', { connectDurationMs: this.connectedAt - this.connectStartAt });
        }
    }

    onAnyChannelClosed() {
        // rely on connection state events
    }

    handleIncomingMessage(event, channelLabel) {
        try {
            const data = JSON.parse(event.data);
            if (data && data.type === 'ping') {
                const reply = { type: 'pong', t: data.t };
                this.sendOnBestChannel(reply);
                return;
            }
            if (data && data.type === 'pong') {
                this.lastPongAt = Date.now();
                return;
            }
            if (this.callbacks.onDataReceived) {
                this.callbacks.onDataReceived(data);
            }
        } catch (error) {
            console.error('Error parsing received data on', channelLabel, error);
        }
    }

    startKeepalives() {
        this.lastPongAt = Date.now();
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
            const now = Date.now();
            this.sendOnBestChannel({ type: 'ping', t: now });
            if (now - this.lastPongAt > this.pingTimeoutMs) {
                console.warn('Keepalive timeout, attempting ICE restart');
                this.attemptIceRestart();
            }
        }, this.pingIntervalMs);
    }

    stopKeepalives() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    sendOnBestChannel(payload) {
        const serialized = JSON.stringify(payload);
        if (this.inputsChannel && this.inputsChannel.readyState === 'open') {
            try { this.inputsChannel.send(serialized); return true; } catch {}
        }
        if (this.controlChannel && this.controlChannel.readyState === 'open') {
            try { this.controlChannel.send(serialized); return true; } catch {}
        }
        return false;
    }

    // Create a new game room
    async createRoom() {
        try {
            this.isInitiator = true;
            this.roomCode = this.generateRoomCode();

            this.connectStartAt = Date.now();
            await this.loadIceServers();
            this.initializePeerConnection();

            // Create dual channels
            const control = this.peerConnection.createDataChannel('control', { ordered: true });
            this.setupControlChannel(control);
            const inputs = this.peerConnection.createDataChannel('inputs', { ordered: false, maxRetransmits: 0 });
            this.setupInputsChannel(inputs);

            // Connect to Durable Object room WS
            await this.connectWebSocket('initiator');

            if (this.callbacks.onRoomCreated) {
                this.callbacks.onRoomCreated(this.roomCode);
            }

            return this.roomCode;
        } catch (error) {
            console.error('Error creating room:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('Failed to create room: ' + error.message);
            }
            throw error;
        }
    }

    // Test signaling server connectivity
    async testSignalingServer() {
        try {
            const response = await fetch(`${this.signalingUrl}/health`);
            if (!response.ok) {
                throw new Error(`Signaling server health check failed: ${response.status}`);
            }
            console.log('Signaling server is healthy');
        } catch (error) {
            console.warn('Signaling server health check failed:', error);
            // Don't throw - allow the app to continue and potentially fail later with better error messages
        }
    }

    // Join an existing game room
    async joinRoom(roomCode) {
        try {
            this.isInitiator = false;
            this.roomCode = roomCode;

            this.connectStartAt = Date.now();
            await this.loadIceServers();
            this.initializePeerConnection();

            // Connect to Durable Object room WS
            await this.connectWebSocket('joiner');

            if (this.callbacks.onRoomJoined) {
                this.callbacks.onRoomJoined(this.roomCode);
            }

            return true;
        } catch (error) {
            console.error('Error joining room:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('Failed to join room: ' + error.message);
            }
            throw error;
        }
    }

    // Send signaling message via WebSocket
    sendSignalingMessage(message) {
        this.queueSignalingMessage(message);
    }

    // Internal send over WebSocket (queued)
    async sendSignalingMessageDirect(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not open');
        }
        const payload = {
            ...message,
            senderId: this.clientId,
            messageId: message.messageId,
            isInitiator: this.isInitiator,
            roomCode: this.roomCode
        };
        this.ws.send(JSON.stringify(payload));
        return { ok: true };
    }

    // Connect to WebSocket signaling via Durable Object
    async connectWebSocket(role) {
        const url = new URL(`${this.signalingUrl}/ws/${this.roomCode}`);
        url.protocol = url.protocol.replace('http', 'ws');
        url.searchParams.set('clientId', this.clientId);
        url.searchParams.set('role', role);

        await this.testSignalingServer();

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url.toString());
            let opened = false;
            ws.onopen = () => {
                opened = true;
                this.ws = ws;
                this.wsReady = true;
                resolve();
            };
            ws.onmessage = async (evt) => {
                try {
                    const message = JSON.parse(evt.data);
                    // Forward signaling messages into the same handler
                    await this.handleSignalingMessage(message);
                } catch (e) {
                    console.warn('WS message parse error', e);
                }
            };
            ws.onclose = () => {
                this.wsReady = false;
            };
            ws.onerror = (err) => {
                if (!opened) reject(err);
            };
        });
    }

    // Stop polling for signaling messages
    stopPolling() {
        // Polling is not used in this implementation
    }

    // Handle incoming signaling messages
    async handleSignalingMessage(message) {
        try {
            switch (message.type) {
                case 'offer':
                    await this.handleOffer(message.offer);
                    break;
                case 'answer':
                    await this.handleAnswer(message.answer);
                    break;
                case 'ice-candidate':
                    await this.handleIceCandidate(message.candidate);
                    break;
                case 'peer-joined':
                    await this.handlePeerJoined();
                    break;
            }
        } catch (error) {
            console.error('Error handling signaling message:', error);
        }
    }

    // Handle offer from peer
    async handleOffer(offer) {
        await this.peerConnection.setRemoteDescription(offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        this.sendSignalingMessage({
            type: 'answer',
            answer: answer,
            roomCode: this.roomCode
        });
    }

    // Handle answer from peer
    async handleAnswer(answer) {
        await this.peerConnection.setRemoteDescription(answer);
    }

    // Handle ICE candidate from peer
    async handleIceCandidate(candidate) {
        await this.peerConnection.addIceCandidate(candidate);
    }

    // Handle peer joined event
    async handlePeerJoined() {
        // Notify the host that someone joined
        if (this.callbacks.onPeerJoined) {
            this.callbacks.onPeerJoined();
        }
        
        if (this.isInitiator) {
            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.sendSignalingMessage({
                type: 'offer',
                offer: offer,
                roomCode: this.roomCode
            });
        }
    }

    // Send game data to peer (reliable)
    sendGameData(data) {
        if (this.controlChannel && this.controlChannel.readyState === 'open') {
            this.controlChannel.send(JSON.stringify(data));
            return true;
        }
        console.warn('Cannot send game data: control channel not ready');
        return false;
    }

    // Generate a random room code
    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Generate a unique client ID
    generateClientId() {
        return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }

    // Close connection
    close() {
        this.stopPolling();
        this.stopKeepalives();
        this.stopQueueProcessing();

        if (this.controlChannel) this.controlChannel.close();
        if (this.inputsChannel) this.inputsChannel.close();

        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.controlChannel = null;
        this.inputsChannel = null;
        this.peerConnection = null;
        this.roomCode = null;
        this.connectedAt = 0;
        this.connectStartAt = 0;
    }

    // Attempt ICE restart with backoff
    async attemptIceRestart() {
        if (!this.peerConnection) return;
        if (this.iceRestartTimer) return;
        if (this.iceRestartAttempts >= this.maxIceRestartAttempts) {
            console.warn('Max ICE restart attempts reached');
            return;
        }
        const delay = this.nextIceRestartDelayMs;
        this.iceRestartTimer = setTimeout(async () => {
            this.iceRestartTimer = null;
            try {
                this.iceRestartAttempts += 1;
                const offer = await this.peerConnection.createOffer({ iceRestart: true });
                await this.peerConnection.setLocalDescription(offer);
                this.sendSignalingMessage({ type: 'offer', offer, roomCode: this.roomCode });
                this.postMetrics('ice_restart', { attempt: this.iceRestartAttempts });
                this.nextIceRestartDelayMs = Math.min(this.nextIceRestartDelayMs * 2, 30000);
            } catch (e) {
                console.error('ICE restart failed', e);
            }
        }, delay);
    }

    async postMetrics(event, payload) {
        try {
            await fetch(`${this.signalingUrl}/metrics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event,
                    roomCode: this.roomCode,
                    clientId: this.clientId,
                    timestamp: Date.now(),
                    ...payload,
                })
            });
        } catch {}
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebRTCManager;
} else {
    window.WebRTCManager = WebRTCManager;
}
