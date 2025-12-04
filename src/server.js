const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { getWordsForRound, TOTAL_ROUNDS, isCorrectGuess } = require('../public/shared.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Load word pairs
const wordPairs = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/words.json'), 'utf8'));

// Game state
let gameState = {
    currentRound: 1,
    chain: [],
    players: new Map(), // playerId -> { name, score, ws, revealedLetters, revealCooldowns }
    roundStartTime: null,
    roundWinner: null
};

// Build a directed graph from word pairs for chain generation
// Word pairs are directional: element[0] -> element[1]
function buildWordGraph() {
    const graph = new Map();
    
    wordPairs.forEach(([word1, word2]) => {
        if (!graph.has(word1)) graph.set(word1, []);
        if (!graph.has(word2)) graph.set(word2, []);
        // Only add edge from word1 to word2 (directional)
        graph.get(word1).push(word2);
    });
    
    return graph;
}

const wordGraph = buildWordGraph();

// Generate a word chain using BFS
function generateWordChain(length) {
    const words = Array.from(wordGraph.keys());
    const maxAttempts = 100;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const startWord = words[Math.floor(Math.random() * words.length)];
        const chain = findChain(startWord, length, wordGraph);
        
        if (chain && chain.length === length) {
            return chain;
        }
    }
    
    // Fallback: return a simple chain
    return words.slice(0, length);
}

// BFS to find a chain of specific length
function findChain(startWord, targetLength, graph) {
    const queue = [[startWord]];
    const visited = new Set([startWord]);
    
    while (queue.length > 0) {
        const path = queue.shift();
        
        if (path.length === targetLength) {
            return path;
        }
        
        const lastWord = path[path.length - 1];
        const neighbors = graph.get(lastWord) || [];
        
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([...path, neighbor]);
                
                if (path.length + 1 === targetLength) {
                    return [...path, neighbor];
                }
            }
        }
    }
    
    return null;
}

// Initialize a new round
function startNewRound() {
    const wordsCount = getWordsForRound(gameState.currentRound);
    gameState.chain = generateWordChain(wordsCount);
    gameState.roundStartTime = Date.now();
    gameState.roundWinner = null;
    
    // Reset revealed letters for all players
    gameState.players.forEach(player => {
        player.revealedLetters = gameState.chain.map(() => new Set());
        // Reset per-word reveal cooldowns (timestamps)
        player.revealCooldowns = gameState.chain.map(() => 0);
    });
    
    broadcastGameState();
    
    // Send updated player states to ensure everyone has fresh revealed letters
    gameState.players.forEach((player, playerId) => {
        sendPlayerState(playerId);
    });
    
    logEvent(`Round ${gameState.currentRound} started! Chain has ${wordsCount} words.`);
}

// Initialize new game
function startNewGame() {
    gameState.currentRound = 1;
    gameState.players.forEach(player => {
        player.score = 0;
    });
    startNewRound();
    logEvent('New game started! All scores reset to 0.');
}

// Broadcast game state to all connected players
function broadcastGameState() {
    const state = {
        type: 'gameState',
        currentRound: gameState.currentRound,
        totalRounds: TOTAL_ROUNDS,
        chain: gameState.chain,
        players: Array.from(gameState.players.values()).map(p => ({
            name: p.name,
            score: p.score
        })),
        roundWinner: gameState.roundWinner
    };
    
    broadcast(state);
}

// Broadcast player-specific state
function sendPlayerState(playerId) {
    const player = gameState.players.get(playerId);
    if (!player) return;
    
    const state = {
        type: 'playerState',
        revealedLetters: player.revealedLetters.map(set => Array.from(set))
    };
    
    player.ws.send(JSON.stringify(state));
}

// Broadcast message to all clients
function broadcast(message) {
    const msg = JSON.stringify(message);
    gameState.players.forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(msg);
        }
    });
}

// Log event to all clients
function logEvent(message) {
    broadcast({
        type: 'log',
        message,
        timestamp: Date.now()
    });
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    const playerId = generateId();
    
    // Send initial connection info
    ws.send(JSON.stringify({
        type: 'connected',
        playerId
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(playerId, data, ws);
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    });
    
    ws.on('close', () => {
        const player = gameState.players.get(playerId);
        if (player) {
            logEvent(`${player.name} disconnected`);
            gameState.players.delete(playerId);
            broadcastGameState();
        }
    });
});

// Handle messages from clients
function handleMessage(playerId, data, ws) {
    switch (data.type) {
        case 'join':
            handleJoin(playerId, data.name, ws);
            break;
        case 'updateName':
            handleUpdateName(playerId, data.name);
            break;
        case 'revealLetter':
            handleRevealLetter(playerId, data.wordIndex);
            break;
        case 'guess':
            handleGuess(playerId, data.wordIndex, data.guess);
            break;
    }
}

// Handle player joining
function handleJoin(playerId, name, ws) {
    gameState.players.set(playerId, {
        name: name || `Player ${gameState.players.size + 1}`,
        score: 0,
        ws,
        revealedLetters: gameState.chain.map(() => new Set()),
        revealCooldowns: gameState.chain.map(() => 0)
    });
    
    const player = gameState.players.get(playerId);
    logEvent(`${player.name} joined the game`);
    
    // Start first round if this is the first player
    if (gameState.players.size === 1 && !gameState.roundStartTime) {
        startNewRound();
    } else {
        broadcastGameState();
        sendPlayerState(playerId);
    }
}

// Handle player name update
function handleUpdateName(playerId, newName) {
    const player = gameState.players.get(playerId);
    if (!player) return;
    
    const oldName = player.name;
    player.name = newName || player.name;
    
    logEvent(`${oldName} changed name to ${player.name}`);
    broadcastGameState();
}

// Handle revealing a letter
function handleRevealLetter(playerId, wordIndex) {
    const player = gameState.players.get(playerId);
    if (!player || wordIndex < 0 || wordIndex >= gameState.chain.length) return;
    
    // Skip first and last words (they're already visible)
    if (wordIndex === 0 || wordIndex === gameState.chain.length - 1) return;

    // Enforce 10s cooldown per word per player
    const now = Date.now();
    const last = player.revealCooldowns[wordIndex] || 0;
    const COOLDOWN_MS = 10000;
    if (now - last < COOLDOWN_MS) {
        sendRevealCooldown(playerId, wordIndex, COOLDOWN_MS - (now - last));
        return;
    }

    // Proceed with reveal and set cooldown timestamp
    revealLetterInternal(playerId, wordIndex);
    player.revealCooldowns[wordIndex] = now;
}

// Internal helper to reveal a letter without cooldown checks
function revealLetterInternal(playerId, wordIndex) {
    const player = gameState.players.get(playerId);
    if (!player) return;
    const word = gameState.chain[wordIndex];
    const revealed = player.revealedLetters[wordIndex];
    // Find next unrevealed letter, but don't reveal the last letter
    for (let i = 0; i < word.length - 1; i++) {
        if (!revealed.has(i)) {
            revealed.add(i);
            break;
        }
    }
    sendPlayerState(playerId);
}

// Notify a single player that reveal is on cooldown
function sendRevealCooldown(playerId, wordIndex, remainingMs) {
    const player = gameState.players.get(playerId);
    if (!player) return;
    player.ws.send(JSON.stringify({
        type: 'revealCooldown',
        wordIndex,
        remainingMs
    }));
}

// Handle word guess
function handleGuess(playerId, wordIndex, guess) {
    const player = gameState.players.get(playerId);
    if (!player || wordIndex < 0 || wordIndex >= gameState.chain.length) return;
    
    // Skip first and last words
    if (wordIndex === 0 || wordIndex === gameState.chain.length - 1) return;
    
    const correctWord = gameState.chain[wordIndex];
    
    if (isCorrectGuess(guess, correctWord)) {
        // Reveal all letters for this word
        player.revealedLetters[wordIndex] = new Set([...Array(correctWord.length).keys()]);
        sendPlayerState(playerId);
        
        // Check if player solved the entire chain
        if (hasPlayerSolvedChain(playerId)) {
            handleRoundWin(playerId);
        }
    } else {
        // Wrong guess - automatically reveal a letter (bypass cooldown)
        revealLetterInternal(playerId, wordIndex);
    }
}

// Check if player has solved all words in the chain
function hasPlayerSolvedChain(playerId) {
    const player = gameState.players.get(playerId);
    if (!player) return false;
    
    for (let i = 1; i < gameState.chain.length - 1; i++) {
        const word = gameState.chain[i];
        const revealed = player.revealedLetters[i];
        
        if (revealed.size < word.length) {
            return false;
        }
    }
    
    return true;
}

// Handle round win
function handleRoundWin(playerId) {
    const player = gameState.players.get(playerId);
    if (!player || gameState.roundWinner) return;
    
    player.score++;
    gameState.roundWinner = player.name;
    
    // Notify the player they completed the round
    player.ws.send(JSON.stringify({
        type: 'roundComplete'
    }));
    
    logEvent(`${player.name} solved the chain and wins Round ${gameState.currentRound}!`);
    broadcastGameState();
    
    // Check if game is over
    if (gameState.currentRound >= TOTAL_ROUNDS) {
        setTimeout(() => handleGameEnd(), 3000);
    } else {
        setTimeout(() => {
            gameState.currentRound++;
            startNewRound();
        }, 5000);
    }
}

// Handle game end
function handleGameEnd() {
    let maxScore = 0;
    let winners = [];
    
    gameState.players.forEach(player => {
        if (player.score > maxScore) {
            maxScore = player.score;
            winners = [player.name];
        } else if (player.score === maxScore) {
            winners.push(player.name);
        }
    });
    
    const winnerText = winners.length === 1 
        ? `${winners[0]} wins the game!`
        : `It's a tie between ${winners.join(', ')}!`;
    
    broadcast({
        type: 'gameEnd',
        winners,
        message: winnerText
    });
    
    logEvent(winnerText);
    
    // Start new game after 10 seconds
    setTimeout(() => startNewGame(), 10000);
}

// Generate unique ID
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Start server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
