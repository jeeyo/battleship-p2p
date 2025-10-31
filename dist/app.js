class BattleshipApp {
    constructor() {
        this.game = new BattleshipGame();
        this.webrtc = new WebRTCManager();
        this.currentScreen = 'connection';
        this.connectionState = 'disconnected';
        
        this.elements = {
            // Connection screen
            createGameBtn: document.getElementById('create-game'),
            joinGameBtn: document.getElementById('join-game'),
            roomCodeInput: document.getElementById('room-code'),
            roomDisplay: document.getElementById('room-display'),
            currentRoomCode: document.getElementById('current-room-code'),
            roomStatus: document.getElementById('room-status'),
            
            // Status elements
            status: document.getElementById('status'),
            playerId: document.getElementById('player-id'),
            
            // Screens
            connectionScreen: document.getElementById('connection-screen'),
            placementScreen: document.getElementById('placement-screen'),
            gameScreen: document.getElementById('game-screen'),
            gameOverScreen: document.getElementById('game-over-screen'),
            
            // Placement screen
            placementBoard: document.getElementById('placement-board'),
            shipItems: document.querySelectorAll('.ship-item'),
            rotateBtn: document.getElementById('rotate-ship'),
            randomPlacementBtn: document.getElementById('random-placement'),
            clearBoardBtn: document.getElementById('clear-board'),
            readyBtn: document.getElementById('ready-btn'),
            playerReadyStatus: document.getElementById('player-ready-status'),
            opponentReadyStatus: document.getElementById('opponent-ready-status'),
            
            // Ship preview elements
            shipPreviewArea: document.querySelector('.ship-preview-area'),
            previewShipName: document.getElementById('preview-ship-name'),
            previewShipVisual: document.getElementById('preview-ship-visual'),
            
            // Game screen
            playerBoard: document.getElementById('player-board'),
            enemyBoard: document.getElementById('enemy-board'),
            turnStatus: document.getElementById('turn-status'),
            shipsRemaining: document.getElementById('ships-remaining'),
            shotsFired: document.getElementById('shots-fired'),
            
            // Game over screen
            gameResult: document.getElementById('game-result'),
            gameSummary: document.getElementById('game-summary'),
            finalPlayerBoard: document.getElementById('final-player-board'),
            finalEnemyBoard: document.getElementById('final-enemy-board'),
            playAgainBtn: document.getElementById('play-again'),
            newGameBtn: document.getElementById('new-game')
        };
        
        this.setupEventListeners();
        this.setupGameCallbacks();
        this.setupWebRTCCallbacks();
        this.initializePlacementBoard();
        this.updateShipPreview(); // Initialize the preview
    }
    
    setupEventListeners() {
        // Connection screen
        this.elements.createGameBtn.addEventListener('click', () => this.createGame());
        this.elements.joinGameBtn.addEventListener('click', () => this.joinGame());
        this.elements.roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinGame();
        });
        
        // Placement screen
        this.elements.shipItems.forEach(item => {
            item.addEventListener('click', () => this.selectShip(item));
        });
        this.elements.rotateBtn.addEventListener('click', () => this.rotateShip());
        this.elements.randomPlacementBtn.addEventListener('click', () => this.randomPlacement());
        this.elements.clearBoardBtn.addEventListener('click', () => this.clearBoard());
        this.elements.readyBtn.addEventListener('click', () => this.setReady());
        
        // Game over screen
        this.elements.playAgainBtn.addEventListener('click', () => this.playAgain());
        this.elements.newGameBtn.addEventListener('click', () => this.newGame());
    }
    
    setupGameCallbacks() {
        this.game.gameCallbacks = {
            onGameStateChange: (state) => this.handleGameStateChange(state),
            onTurnChange: (turn) => this.handleTurnChange(turn),
            onGameOver: (winner) => this.handleGameOver(winner)
        };
    }
    
    setupWebRTCCallbacks() {
        this.webrtc.callbacks = {
            onConnectionStateChange: (state) => this.handleConnectionStateChange(state),
            onDataReceived: (data) => this.handleDataReceived(data),
            onRoomCreated: (roomCode) => this.handleRoomCreated(roomCode),
            onRoomJoined: (roomCode) => this.handleRoomJoined(roomCode),
            onPeerJoined: () => this.handlePeerJoined(),
            onError: (error) => this.handleError(error)
        };
    }
    
    // Connection methods
    async createGame() {
        try {
            this.elements.createGameBtn.disabled = true;
            this.elements.createGameBtn.textContent = 'Creating...';
            
            await this.webrtc.createRoom();
        } catch (error) {
            this.elements.createGameBtn.disabled = false;
            this.elements.createGameBtn.textContent = 'Create New Game';
            console.error('Failed to create game:', error);
        }
    }
    
    async joinGame() {
        const roomCode = this.elements.roomCodeInput.value.trim().toUpperCase();
        if (roomCode.length !== 6) {
            alert('Please enter a valid 6-character room code');
            return;
        }
        
        try {
            this.elements.joinGameBtn.disabled = true;
            this.elements.joinGameBtn.textContent = 'Joining...';
            
            await this.webrtc.joinRoom(roomCode);
        } catch (error) {
            this.elements.joinGameBtn.disabled = false;
            this.elements.joinGameBtn.textContent = 'Join Game';
            console.error('Failed to join game:', error);
        }
    }
    
    // WebRTC event handlers
    handleConnectionStateChange(state) {
        this.connectionState = state; // Store connection state locally
        this.elements.status.textContent = state === 'connected' ? 'Connected' : 'Disconnected';
        this.elements.status.className = state === 'connected' ? 'connected' : '';
        
        if (state === 'connected') {
            // Reset join button state now that connection is established
            this.elements.joinGameBtn.disabled = false;
            this.elements.joinGameBtn.textContent = 'Join Game';
            
            // Update room status to show successful connection
            if (this.elements.roomStatus) {
                this.elements.roomStatus.textContent = 'Connected! Setting up game...';
            }
            
            this.showScreen('placement');
            this.game.gameState = 'placing';
            this.updatePlacementStatus();
        } else if (['disconnected', 'failed', 'closed'].includes(state)) {
            // Handle disconnections during different game phases
            if (this.currentScreen === 'placement') {
                this.showScreen('connection');
                this.game.gameState = 'waiting';
                // Reset WebRTC connection
                this.webrtc.close();
                // Reset game state and UI
                this.game.resetGame();
                this.elements.roomDisplay.classList.add('hidden');
                this.elements.currentRoomCode.textContent = '';
                this.elements.playerId.textContent = '';
                this.elements.roomCodeInput.value = '';
                this.elements.roomStatus.textContent = 'Waiting for opponent...';
                // Reset button states
                this.elements.createGameBtn.disabled = false;
                this.elements.createGameBtn.textContent = 'Create New Game';
                this.elements.joinGameBtn.disabled = false;
                this.elements.joinGameBtn.textContent = 'Join Game';
                // Show disconnection message
                alert('Your opponent has disconnected during ship placement. Please create a new game or join another room.');
            } else if (this.currentScreen === 'game') {
                this.showScreen('connection');
                this.game.gameState = 'waiting';
                // Reset WebRTC connection
                this.webrtc.close();
                // Reset game state and UI
                this.game.resetGame();
                this.elements.roomDisplay.classList.add('hidden');
                this.elements.currentRoomCode.textContent = '';
                this.elements.playerId.textContent = '';
                this.elements.roomCodeInput.value = '';
                this.elements.roomStatus.textContent = 'Waiting for opponent...';
                // Reset button states
                this.elements.createGameBtn.disabled = false;
                this.elements.createGameBtn.textContent = 'Create New Game';
                this.elements.joinGameBtn.disabled = false;
                this.elements.joinGameBtn.textContent = 'Join Game';
                // Show disconnection message
                alert('Your opponent has disconnected during the game. Please create a new game or join another room.');
            }
        }
    }
    
    handleDataReceived(data) {
        switch (data.type) {
            case 'ship-placement':
                this.game.loadEnemyShips(data.ships);
                this.game.setEnemyReady();
                this.updatePlacementStatus();
                break;
            case 'player-ready':
                this.game.setEnemyReady();
                this.updatePlacementStatus();
                break;
            case 'player-unready':
                this.game.setEnemyUnready();
                this.updatePlacementStatus();
                break;
            case 'attack':
                this.receiveAttack(data.row, data.col);
                break;
            case 'attack-result':
                this.handleAttackResult(data);
                break;
            case 'turn-switch':
                this.handleTurnSwitch(data);
                break;
        }
    }

    handleRoomCreated(roomCode) {
        this.elements.currentRoomCode.textContent = roomCode;
        this.elements.roomDisplay.classList.remove('hidden');
        this.elements.playerId.textContent = `Room: ${roomCode}`;
        // Room creator goes first
        this.game.setInitiator(true);
    }

    handleRoomJoined(roomCode) {
        this.elements.currentRoomCode.textContent = roomCode;
        this.elements.roomDisplay.classList.remove('hidden');
        this.elements.playerId.textContent = `Room: ${roomCode}`;
        // Keep button in "Joining..." state until WebRTC connection is established
        // Button will be reset in handleConnectionStateChange when connected
        // Joiner waits for room creator to go first
        this.game.setInitiator(false);
    }

    handlePeerJoined() {
        console.log('Peer joined the game');
        // Update status to show someone joined but WebRTC is still connecting
        if (this.elements.roomStatus) {
            this.elements.roomStatus.textContent = 'Opponent joined! Connecting...';
        }
    }
    
    handleError(error) {
        alert('Connection error: ' + error);
    }
    
    // Game event handlers
    handleGameStateChange(state) {
        if (state === 'playing') {
            this.showScreen('game');
            this.renderBoards();
            // Initialize turn indicator when game starts
            this.handleTurnChange(this.game.currentTurn);
        } else if (state === 'placing') {
            this.showScreen('placement');
            this.updateReadyButton();
            this.updatePlacementStatus();
        }
    }
    
    handleTurnChange(turn) {
        this.elements.turnStatus.textContent = turn === 'player' ? 'Your Turn' : 'Enemy Turn';
        this.elements.enemyBoard.style.pointerEvents = turn === 'player' ? 'auto' : 'none';
    }
    
    handleGameOver(winner) {
        this.elements.gameResult.textContent = winner === 'player' ? 'Victory!' : 'Defeat!';
        this.elements.gameResult.className = winner === 'player' ? '' : 'defeat';
        this.elements.gameSummary.textContent = winner === 'player' 
            ? 'You have successfully sunk all enemy ships!'
            : 'All your ships have been destroyed!';
        
        // Render final boards to show complete game state
        this.renderFinalBoards();
        this.showScreen('game-over');
    }
    
    // UI methods
    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        switch (screenName) {
            case 'connection':
                this.elements.connectionScreen.classList.add('active');
                break;
            case 'placement':
                this.elements.placementScreen.classList.add('active');
                break;
            case 'game':
                this.elements.gameScreen.classList.add('active');
                break;
            case 'game-over':
                this.elements.gameOverScreen.classList.add('active');
                break;
        }
        
        this.currentScreen = screenName;
    }
    
    // Ship placement methods
    initializePlacementBoard() {
        this.elements.placementBoard.innerHTML = '';
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                cell.addEventListener('click', () => this.placementCellClick(row, col));
                cell.addEventListener('mouseenter', () => this.placementCellHover(row, col));
                cell.addEventListener('mouseleave', () => this.clearPlacementPreview());
                
                this.elements.placementBoard.appendChild(cell);
            }
        }
    }
    
    selectShip(shipItem) {
        // Deselect all ships
        this.elements.shipItems.forEach(item => item.classList.remove('selected'));
        
        const shipName = shipItem.dataset.ship;
        const ship = this.game.ships.find(s => s.name === shipName);
        
        if (ship.placed) {
            // Remove existing ship
            this.game.removeShip(this.game.playerBoard, this.game.playerShips, shipName);
            shipItem.classList.remove('placed');
            this.renderPlacementBoard();
            this.updateReadyButton();
            this.game.selectedShip = null;
            this.updateShipPreview();
            return;
        }
        
        // Select new ship
        shipItem.classList.add('selected');
        this.game.selectedShip = shipName;
        this.updateShipPreview();
    }
    
    rotateShip() {
        this.game.shipOrientation = this.game.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        
        // Update ship preview orientations
        document.querySelectorAll('.ship-preview').forEach(preview => {
            preview.className = `ship-preview ${this.game.shipOrientation}`;
        });
        
        // Update the main ship preview area
        this.updateShipPreview();
    }
    
    placementCellClick(row, col) {
        if (!this.game.selectedShip) return;
        
        const success = this.game.placeShip(
            this.game.playerBoard,
            this.game.playerShips,
            this.game.selectedShip,
            row,
            col,
            this.game.shipOrientation
        );
        
        if (success) {
            // Mark ship as placed
            const shipItem = document.querySelector(`[data-ship="${this.game.selectedShip}"]`);
            shipItem.classList.add('placed');
            shipItem.classList.remove('selected');
            
            this.game.selectedShip = null;
            this.renderPlacementBoard();
            this.updateReadyButton();
            this.updateShipPreview();
        }
    }
    
    placementCellHover(row, col) {
        if (!this.game.selectedShip) return;
        
        this.clearPlacementPreview();
        
        const ship = this.game.ships.find(s => s.name === this.game.selectedShip);
        const isValid = this.game.isValidPlacement(
            this.game.playerBoard,
            row,
            col,
            ship.size,
            this.game.shipOrientation
        );
        
        // Preview ship placement
        for (let i = 0; i < ship.size; i++) {
            const r = this.game.shipOrientation === 'vertical' ? row + i : row;
            const c = this.game.shipOrientation === 'horizontal' ? col + i : col;
            
            if (r < 10 && c < 10) {
                const cell = this.elements.placementBoard.children[r * 10 + c];
                cell.classList.add(isValid ? 'valid-placement' : 'invalid-placement');
            }
        }
    }
    
    clearPlacementPreview() {
        this.elements.placementBoard.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('valid-placement', 'invalid-placement');
        });
    }
    
    randomPlacement() {
        this.game.placeShipsRandomly(this.game.playerBoard, this.game.playerShips);
        
        // Update UI
        this.elements.shipItems.forEach(item => {
            item.classList.add('placed');
            item.classList.remove('selected');
        });
        
        this.game.selectedShip = null;
        this.renderPlacementBoard();
        this.updateReadyButton();
        this.updateShipPreview();
    }
    
    clearBoard() {
        this.game.ships.forEach(ship => {
            ship.placed = false;
        });
        this.game.playerShips = [];
        
        // Reset board
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 10; c++) {
                this.game.playerBoard[r][c] = {
                    hasShip: false,
                    hit: false,
                    shipId: null,
                    shipPart: null
                };
            }
        }
        
        // Update UI
        this.elements.shipItems.forEach(item => {
            item.classList.remove('placed', 'selected');
        });
        
        this.game.selectedShip = null;
        this.renderPlacementBoard();
        this.updateReadyButton();
        this.updateShipPreview();
    }
    
    renderPlacementBoard() {
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                const cell = this.elements.placementBoard.children[row * 10 + col];
                const cellData = this.game.playerBoard[row][col];
                
                cell.className = 'cell';
                if (cellData.hasShip) {
                    cell.classList.add('ship');
                }
            }
        }
    }
    
        updateReadyButton() {
        const allShipsPlaced = this.game.allShipsPlaced();
        const isReady = this.game.playerReady;
        
        if (isReady) {
            this.elements.readyBtn.textContent = 'Unready';
            this.elements.readyBtn.disabled = false;
            this.elements.readyBtn.className = 'secondary-btn';
        } else {
            this.elements.readyBtn.textContent = 'Ready!';
            this.elements.readyBtn.disabled = !allShipsPlaced;
            this.elements.readyBtn.className = 'primary-btn';
        }
        
        // Update status indicators
        this.updatePlacementStatus();
    }
    
    updatePlacementStatus() {
        // Update player status
        if (this.game.playerReady) {
            this.elements.playerReadyStatus.textContent = 'Ready';
            this.elements.playerReadyStatus.className = 'status-badge ready';
        } else {
            this.elements.playerReadyStatus.textContent = 'Not Ready';
            this.elements.playerReadyStatus.className = 'status-badge not-ready';
        }
        
        // Update opponent status
        console.log('Updating placement status - Connection:', this.connectionState, 'Enemy Ready:', this.game.enemyReady);
        if (this.connectionState !== 'connected') {
            this.elements.opponentReadyStatus.textContent = 'Waiting...';
            this.elements.opponentReadyStatus.className = 'status-badge waiting';
        } else if (this.game.enemyReady) {
            this.elements.opponentReadyStatus.textContent = 'Ready';
            this.elements.opponentReadyStatus.className = 'status-badge ready';
        } else {
            this.elements.opponentReadyStatus.textContent = 'Not Ready';
            this.elements.opponentReadyStatus.className = 'status-badge not-ready';
        }
    }

    setReady() {
        if (this.game.playerReady) {
            // Player wants to unready
            this.webrtc.sendGameData({
                type: 'player-unready'
            });
            this.game.setPlayerUnready();
        } else {
            // Player wants to ready
            // Send ship placement to opponent
            const gameData = this.game.getGameData();
            this.webrtc.sendGameData({
                type: 'ship-placement',
                ships: gameData.playerShips
            });
            
            this.webrtc.sendGameData({
                type: 'player-ready'
            });
            
            this.game.setPlayerReady();
        }
        
        this.updateReadyButton();
    }
    
    // Game board rendering
    renderBoards() {
        this.renderPlayerBoard();
        this.renderEnemyBoard();
        this.updateGameStats();
    }
    
    renderPlayerBoard() {
        this.elements.playerBoard.innerHTML = '';
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                
                const cellState = this.game.getCellState(this.game.playerBoard, row, col);
                cell.classList.add(cellState);
                
                this.elements.playerBoard.appendChild(cell);
            }
        }
    }
    
    renderEnemyBoard() {
        this.elements.enemyBoard.innerHTML = '';
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                const cellData = this.game.enemyBoard[row][col];
                if (cellData.hit) {
                    cell.classList.add(cellData.hasShip ? 
                        (cellData.sunk ? 'sunk' : 'hit') : 'miss');
                }
                
                cell.addEventListener('click', () => this.enemyCellClick(row, col));
                
                this.elements.enemyBoard.appendChild(cell);
            }
        }
    }
    
    enemyCellClick(row, col) {
        if (this.game.currentTurn !== 'player') return;
        
        // Check if cell already hit
        const cell = this.game.enemyBoard[row][col];
        if (cell.hit) return;
        
        // Mark as hit temporarily and increment shots
        cell.hit = true;
        this.game.shotsFired++;
        
        // Switch turns after making attack and notify opponent
        this.game.switchTurn();
        this.webrtc.sendGameData({
            type: 'turn-switch',
            newTurn: this.game.currentTurn
        });
        
        // Send attack to opponent
        this.webrtc.sendGameData({
            type: 'attack',
            row: row,
            col: col
        });
        
        // Update display
        this.renderEnemyBoard();
        this.updateGameStats();
    }
    
    receiveAttack(row, col) {
        const result = this.game.receiveEnemyMove(row, col);
        
        // Check if this attack caused the defender to lose
        const gameOver = this.game.gameState === 'finished';
        
        // Send result back
        this.webrtc.sendGameData({
            type: 'attack-result',
            row: row,
            col: col,
            result: result.result,
            ship: result.ship,
            gameOver: gameOver,
            winner: gameOver ? 'attacker' : null
        });
        
        // Update display
        this.renderPlayerBoard();
        this.updateGameStats();
    }
    
    handleAttackResult(data) {
        // Update enemy board with result
        const cell = this.game.enemyBoard[data.row][data.col];
        cell.hit = true;
        
        if (data.result === 'hit' || data.result === 'sunk') {
            cell.hasShip = true;
            if (data.result === 'sunk') {
                cell.sunk = true;
            }
        }
        
        // Check if the game is over (opponent confirmed they lost)
        if (data.gameOver && data.winner === 'attacker') {
            this.game.gameState = 'finished';
            this.handleGameOver('player');
            this.renderEnemyBoard();
            return;
        }
        
        this.renderEnemyBoard();
        this.updateGameStats();
    }
    
    handleTurnSwitch(data) {
        // Synchronize turn state with opponent (invert the turn)
        this.game.currentTurn = data.newTurn === 'player' ? 'enemy' : 'player';
        this.handleTurnChange(this.game.currentTurn);
    }
    
    updateGameStats() {
        const remainingShips = this.game.playerShips.filter(ship => !ship.sunk).length;
        this.elements.shipsRemaining.textContent = remainingShips;
        this.elements.shotsFired.textContent = this.game.shotsFired;
    }
    
    // Final boards rendering (shows all ships)
    renderFinalBoards() {
        this.renderFinalPlayerBoard();
        this.renderFinalEnemyBoard();
    }
    
    renderFinalPlayerBoard() {
        this.elements.finalPlayerBoard.innerHTML = '';
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                
                const cellState = this.game.getCellState(this.game.playerBoard, row, col);
                cell.classList.add(cellState);
                
                this.elements.finalPlayerBoard.appendChild(cell);
            }
        }
    }
    
    renderFinalEnemyBoard() {
        this.elements.finalEnemyBoard.innerHTML = '';
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                
                const cellData = this.game.enemyBoard[row][col];
                
                // Show all ships on the final enemy board
                if (cellData.hasShip) {
                    cell.classList.add('ship');
                    if (cellData.hit) {
                        cell.classList.add(cellData.sunk ? 'sunk' : 'hit');
                    }
                } else if (cellData.hit) {
                    cell.classList.add('miss');
                }
                
                this.elements.finalEnemyBoard.appendChild(cell);
            }
        }
    }
    
    // Ship preview methods
    updateShipPreview() {
        if (!this.game.selectedShip) {
            this.elements.previewShipName.textContent = 'Select a ship';
            this.elements.previewShipVisual.innerHTML = '';
            this.elements.shipPreviewArea.classList.remove('selected');
            return;
        }

        const ship = this.game.ships.find(s => s.name === this.game.selectedShip);
        const shipDisplayName = ship.name.charAt(0).toUpperCase() + ship.name.slice(1);
        this.elements.previewShipName.textContent = `${shipDisplayName} (${ship.size})`;
        
        // Clear previous preview
        this.elements.previewShipVisual.innerHTML = '';
        this.elements.previewShipVisual.className = `preview-ship-visual ${this.game.shipOrientation}`;
        
        // Add ship blocks
        for (let i = 0; i < ship.size; i++) {
            const shipBlock = document.createElement('div');
            shipBlock.className = 'ship-block';
            this.elements.previewShipVisual.appendChild(shipBlock);
        }
        
        this.elements.shipPreviewArea.classList.add('selected');
    }

    // Game control methods
    playAgain() {
        this.game.resetGame();
        this.showScreen('placement');
        this.initializePlacementBoard();
        
        // Reset UI state
        this.elements.shipItems.forEach(item => {
            item.classList.remove('placed', 'selected');
        });
        this.updateReadyButton();
        this.updateShipPreview();
    }
    
    newGame() {
        this.webrtc.close();
        this.game.resetGame();
        this.showScreen('connection');
        
        // Reset UI state
        this.elements.roomDisplay.classList.add('hidden');
        this.elements.roomCodeInput.value = '';
        this.elements.status.textContent = 'Disconnected';
        this.elements.status.className = '';
        this.elements.playerId.textContent = '';
        this.elements.roomStatus.textContent = 'Waiting for opponent...';
        
        this.elements.createGameBtn.disabled = false;
        this.elements.createGameBtn.textContent = 'Create New Game';
        this.elements.joinGameBtn.disabled = false;
        this.elements.joinGameBtn.textContent = 'Join Game';
    }


}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BattleshipApp();
}); 