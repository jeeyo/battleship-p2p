class BattleshipGame {
    constructor() {
        this.boardSize = 10;
        this.ships = [
            { name: 'carrier', size: 5, placed: false },
            { name: 'battleship', size: 4, placed: false },
            { name: 'cruiser', size: 3, placed: false },
            { name: 'submarine', size: 3, placed: false },
            { name: 'destroyer', size: 2, placed: false }
        ];
        
        this.playerBoard = this.createBoard();
        this.enemyBoard = this.createBoard();
        this.playerShips = [];
        this.enemyShips = [];
        
        this.currentTurn = 'player';
        this.gameState = 'waiting'; // waiting, placing, playing, finished
        this.playerReady = false;
        this.enemyReady = false;
        
        this.selectedShip = null;
        this.shipOrientation = 'horizontal';
        this.shotsFired = 0;
        
        this.gameCallbacks = {
            onGameStateChange: null,
            onTurnChange: null,
            onHit: null,
            onMiss: null,
            onShipSunk: null,
            onGameOver: null
        };
    }
    
    createBoard() {
        return Array(this.boardSize).fill(null).map(() => 
            Array(this.boardSize).fill(null).map(() => ({
                hasShip: false,
                hit: false,
                shipId: null,
                shipPart: null
            }))
        );
    }
    
    // Ship placement methods
    isValidPlacement(board, row, col, size, orientation) {
        const endRow = orientation === 'vertical' ? row + size - 1 : row;
        const endCol = orientation === 'horizontal' ? col + size - 1 : col;
        
        // Check bounds
        if (endRow >= this.boardSize || endCol >= this.boardSize) {
            return false;
        }
        
        // Check for ship overlap only (allow adjacent ships)
        for (let i = 0; i < size; i++) {
            const r = orientation === 'vertical' ? row + i : row;
            const c = orientation === 'horizontal' ? col + i : col;
            if (board[r][c].hasShip) {
                return false;
            }
        }
        
        return true;
    }
    
    placeShip(board, ships, shipName, row, col, orientation) {
        const ship = this.ships.find(s => s.name === shipName);
        if (!ship || ship.placed) return false;
        
        if (!this.isValidPlacement(board, row, col, ship.size, orientation)) {
            return false;
        }
        
        const shipId = ships.length;
        const placedShip = {
            id: shipId,
            name: shipName,
            size: ship.size,
            hits: 0,
            sunk: false,
            positions: []
        };
        
        // Place ship on board
        for (let i = 0; i < ship.size; i++) {
            const r = orientation === 'vertical' ? row + i : row;
            const c = orientation === 'horizontal' ? col + i : col;
            
            board[r][c] = {
                hasShip: true,
                hit: false,
                shipId: shipId,
                shipPart: i
            };
            
            placedShip.positions.push({ row: r, col: c });
        }
        
        ships.push(placedShip);
        ship.placed = true;
        
        return true;
    }
    
    removeShip(board, ships, shipName) {
        const ship = this.ships.find(s => s.name === shipName);
        if (!ship) return;
        
        const placedShip = ships.find(s => s.name === shipName);
        if (placedShip) {
            // Remove from board
            placedShip.positions.forEach(pos => {
                board[pos.row][pos.col] = {
                    hasShip: false,
                    hit: false,
                    shipId: null,
                    shipPart: null
                };
            });
            
            // Remove from ships array
            const index = ships.findIndex(s => s.name === shipName);
            ships.splice(index, 1);
        }
        
        ship.placed = false;
    }
    
    placeShipsRandomly(board, ships) {
        // Clear existing ships
        this.ships.forEach(ship => {
            ship.placed = false;
        });
        ships.length = 0;
        
        // Reset board
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                board[r][c] = {
                    hasShip: false,
                    hit: false,
                    shipId: null,
                    shipPart: null
                };
            }
        }
        
        // Place ships randomly
        this.ships.forEach(ship => {
            let placed = false;
            let attempts = 0;
            
            while (!placed && attempts < 100) {
                const row = Math.floor(Math.random() * this.boardSize);
                const col = Math.floor(Math.random() * this.boardSize);
                const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
                
                if (this.placeShip(board, ships, ship.name, row, col, orientation)) {
                    placed = true;
                }
                attempts++;
            }
        });
    }
    
    // Attack methods
    attack(board, ships, row, col) {
        const cell = board[row][col];
        
        if (cell.hit) {
            return { result: 'already-hit', cell: null };
        }
        
        cell.hit = true;
        
        if (cell.hasShip) {
            const ship = ships[cell.shipId];
            ship.hits++;
            
            if (ship.hits >= ship.size) {
                ship.sunk = true;
                // Mark all ship positions as sunk
                ship.positions.forEach(pos => {
                    board[pos.row][pos.col].sunk = true;
                });
                
                return { 
                    result: 'sunk', 
                    cell: { row, col, hasShip: true },
                    ship: ship 
                };
            }
            
            return { 
                result: 'hit', 
                cell: { row, col, hasShip: true } 
            };
        }
        
        return { 
            result: 'miss', 
            cell: { row, col, hasShip: false } 
        };
    }
    
    // Game state methods
    allShipsPlaced() {
        return this.ships.every(ship => ship.placed);
    }
    
    allShipsSunk(ships) {
        return ships.every(ship => ship.sunk);
    }
    
    setPlayerReady() {
        this.playerReady = true;
        this.checkGameStart();
    }
    
    setEnemyReady() {
        this.enemyReady = true;
        this.checkGameStart();
    }
    
    checkGameStart() {
        if (this.playerReady && this.enemyReady) {
            this.gameState = 'playing';
            this.currentTurn = 'player';
            if (this.gameCallbacks.onGameStateChange) {
                this.gameCallbacks.onGameStateChange('playing');
            }
        }
    }
    
    switchTurn() {
        this.currentTurn = this.currentTurn === 'player' ? 'enemy' : 'player';
        if (this.gameCallbacks.onTurnChange) {
            this.gameCallbacks.onTurnChange(this.currentTurn);
        }
    }
    
    makeMove(row, col) {
        if (this.gameState !== 'playing' || this.currentTurn !== 'player') {
            return null;
        }
        
        const result = this.attack(this.enemyBoard, this.enemyShips, row, col);
        
        if (result.result === 'already-hit') {
            return null;
        }
        
        this.shotsFired++;
        
        // Handle result callbacks
        if (result.result === 'hit' && this.gameCallbacks.onHit) {
            this.gameCallbacks.onHit(row, col);
        } else if (result.result === 'miss' && this.gameCallbacks.onMiss) {
            this.gameCallbacks.onMiss(row, col);
        } else if (result.result === 'sunk' && this.gameCallbacks.onShipSunk) {
            this.gameCallbacks.onShipSunk(result.ship);
        }
        
        // Check for game over
        if (this.allShipsSunk(this.enemyShips)) {
            this.gameState = 'finished';
            if (this.gameCallbacks.onGameOver) {
                this.gameCallbacks.onGameOver('player');
            }
            return result;
        }
        
        // Switch turns only on miss
        if (result.result === 'miss') {
            this.switchTurn();
        }
        
        return result;
    }
    
    receiveEnemyMove(row, col) {
        if (this.gameState !== 'playing') {
            return null;
        }
        
        const result = this.attack(this.playerBoard, this.playerShips, row, col);
        
        // Check for game over
        if (this.allShipsSunk(this.playerShips)) {
            this.gameState = 'finished';
            if (this.gameCallbacks.onGameOver) {
                this.gameCallbacks.onGameOver('enemy');
            }
            return result;
        }
        
        // Don't switch turns here - let the attacker handle turn switching
        // based on the result they receive
        
        return result;
    }
    
    resetGame() {
        this.playerBoard = this.createBoard();
        this.enemyBoard = this.createBoard();
        this.playerShips = [];
        this.enemyShips = [];
        
        this.ships.forEach(ship => ship.placed = false);
        
        this.currentTurn = 'player';
        this.gameState = 'placing';
        this.playerReady = false;
        this.enemyReady = false;
        this.selectedShip = null;
        this.shipOrientation = 'horizontal';
        this.shotsFired = 0;
    }
    
    // Utility methods
    getCellState(board, row, col) {
        const cell = board[row][col];
        if (!cell.hit) {
            return cell.hasShip ? 'ship' : 'water';
        }
        
        if (cell.hasShip) {
            return cell.sunk ? 'sunk' : 'hit';
        }
        
        return 'miss';
    }
    
    getGameData() {
        return {
            playerShips: this.playerShips.map(ship => ({
                name: ship.name,
                positions: ship.positions,
                orientation: ship.positions.length > 1 && 
                           ship.positions[0].row === ship.positions[1].row ? 'horizontal' : 'vertical'
            })),
            gameState: this.gameState,
            playerReady: this.playerReady
        };
    }
    
    loadEnemyShips(enemyShips) {
        this.enemyShips = enemyShips.map((ship, index) => ({
            ...ship,
            id: index,
            hits: 0,
            sunk: false
        }));
        
        // Place ships on enemy board
        this.enemyBoard = this.createBoard();
        this.enemyShips.forEach(ship => {
            ship.positions.forEach((pos, partIndex) => {
                this.enemyBoard[pos.row][pos.col] = {
                    hasShip: true,
                    hit: false,
                    shipId: ship.id,
                    shipPart: partIndex
                };
            });
        });
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BattleshipGame;
} else {
    window.BattleshipGame = BattleshipGame;
} 