// Client-side game logic
let ws;
let playerId;
let currentChain = [];
let revealedLetters = [];
let currentGuessIndex = -1;
let currentRound = 0;
let lastRevealRequest = {}; // per-wordIndex timestamp

// Initialize on page load
$(document).ready(function() {
    initializeTheme();
    setupEventListeners();
    connectWebSocket();
});

// Setup WebSocket connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('Connected to server');
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
    
    ws.onclose = function() {
        console.log('Disconnected from server');
        addEventLog('Disconnected from server. Attempting to reconnect...');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

// Handle messages from server
function handleServerMessage(data) {
    switch(data.type) {
        case 'connected':
            playerId = data.playerId;
            joinGame(); // Auto-join with default or saved name
            break;
        case 'gameState':
            updateGameState(data);
            break;
        case 'playerState':
            updatePlayerState(data);
            break;
        case 'roundComplete':
            showRoundCompleteModal();
            break;
        case 'revealCooldown':
            flashCooldown(data.wordIndex);
            break;
        case 'log':
            addEventLog(data.message);
            break;
        case 'gameEnd':
            showWinnerModal(data);
            break;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Theme toggle
    $('#theme-toggle').on('click', toggleTheme);
    
    // Load saved name if exists
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
        $('#player-name-input').val(savedName);
    }
    
    // Auto-save name on change (with debounce)
    let nameTimeout;
    $('#player-name-input').on('input', function() {
        clearTimeout(nameTimeout);
        nameTimeout = setTimeout(() => {
            updatePlayerName();
        }, 1000);
    });
    
    // Also save on blur (when clicking away)
    $('#player-name-input').on('blur', function() {
        clearTimeout(nameTimeout);
        updatePlayerName();
    })
    
    // Guess modal
    $('#submit-guess').on('click', submitGuess);
    $('#reveal-letter').on('click', revealLetter);
    $('#cancel-guess').on('click', closeGuessModal);
    $('#guess-input').on('keypress', function(e) {
        if (e.which === 13) submitGuess();
    });
}

// Join game (auto-called on connection)
function joinGame() {
    const name = $('#player-name-input').val().trim() || 'Guest';
    
    ws.send(JSON.stringify({
        type: 'join',
        name: name
    }));
}

// Update player name
function updatePlayerName() {
    const name = $('#player-name-input').val().trim();
    if (!name) {
        return; // Don't update if empty
    }
    
    // Save to localStorage
    localStorage.setItem('playerName', name);
    
    // Send to server
    ws.send(JSON.stringify({
        type: 'updateName',
        name: name
    }));
}

// Update game state
function updateGameState(state) {
    currentChain = state.chain;
    
    // Always reset revealed letters when game state updates
    // This ensures new rounds/games start fresh
    revealedLetters = currentChain.map(() => []);
    
    // Hide round complete modal only when new round starts
    if (state.currentRound !== currentRound) {
        $('#round-complete-modal').addClass('hidden').css('display', 'none');
        currentRound = state.currentRound;
        lastRevealRequest = {}; // reset cooldown trackers on new round
    }
    
    // Update round info
    $('#round-info').text(`Round ${state.currentRound} of ${state.totalRounds}`);
    
    // Update chain display
    renderChain();
    
    // Update leaderboard
    updateLeaderboard(state.players);
}

// Update player-specific state
function updatePlayerState(state) {
    revealedLetters = state.revealedLetters;
    renderChain();
}

// Show round complete modal
function showRoundCompleteModal() {
    console.log('Round complete! Showing modal...');
    const modal = $('#round-complete-modal');
    console.log('Modal element found:', modal.length);
    console.log('Modal classes before:', modal.attr('class'));
    modal.removeClass('hidden');
    modal.css('display', 'flex'); // Explicitly set display
    console.log('Modal classes after:', modal.attr('class'));
    console.log('Modal display:', modal.css('display'));
}

// Render the word chain
function renderChain() {
    const container = $('#chain-container');
    container.empty();
    
    if (currentChain.length === 0) {
        container.html('<p class="empty-message">Waiting for round to start...</p>');
        return;
    }
    
    currentChain.forEach((word, index) => {
        const isFirst = index === 0;
        const isLast = index === currentChain.length - 1;
        const isSolved = revealedLetters[index] && revealedLetters[index].length === word.length;
        
            const wordDiv = $('<div>').addClass('word-item').attr('data-index', index);
        
        if (isFirst || isLast) {
            // First and last words are always visible
            wordDiv.addClass('visible');
            wordDiv.html(`<div class="word-display">${word.toUpperCase()}</div>`);
        } else if (isSolved) {
            // Solved words show completely
            wordDiv.addClass('solved');
            wordDiv.html(`<div class="word-display">${word.toUpperCase()}</div>`);
        } else {
            // Unsolved words show placeholders with revealed letters
            wordDiv.addClass('unsolved');
            const letterBoxes = word.split('').map((letter, letterIndex) => {
                const isRevealed = revealedLetters[index] && revealedLetters[index].includes(letterIndex);
                const boxClass = isRevealed ? 'letter-box revealed' : 'letter-box';
                const content = isRevealed ? letter.toUpperCase() : '';
                return `<div class="${boxClass}">${content}</div>`;
            }).join('');
            
            const wordDisplay = $('<div>').addClass('word-display').html(letterBoxes);
            
            // Create guess button inside the word div
            const guessButton = $('<button>').addClass('guess-button');
            guessButton.on('click', (e) => {
                e.stopPropagation();
                openGuessModal(index);
            });
            
            wordDiv.append(wordDisplay);
            wordDiv.append(guessButton);
            
            // Click on word div (not button) reveals a letter
            wordDiv.on('click', () => revealLetterDirect(index));
        }
        
        container.append(wordDiv);
        
        // Add arrow between words
        /*
        if (index < currentChain.length - 1) {
            container.append('<div class="chain-arrow">→</div>');
        }
        */
    });
}

// Open guess modal for a word
function openGuessModal(wordIndex) {
    currentGuessIndex = wordIndex;
    const word = currentChain[wordIndex];
    const revealed = revealedLetters[wordIndex] || [];
    
    $('#guess-hint').text(`Word has ${word.length} letters (${revealed.length} revealed)`);
    $('#guess-input').val('');
    $('#guess-modal').removeClass('hidden');
    $('#guess-input').focus();
}

// Close guess modal
function closeGuessModal() {
    $('#guess-modal').addClass('hidden');
    currentGuessIndex = -1;
}

// Submit guess
function submitGuess() {
    const guess = $('#guess-input').val().trim();
    if (!guess) return;
    
    ws.send(JSON.stringify({
        type: 'guess',
        wordIndex: currentGuessIndex,
        guess: guess
    }));
    
    closeGuessModal();
}

// Reveal a letter from the guess modal
function revealLetter() {
    ws.send(JSON.stringify({
        type: 'revealLetter',
        wordIndex: currentGuessIndex
    }));
    
    closeGuessModal();
}

// Reveal a letter directly (when clicking word div)
function revealLetterDirect(wordIndex) {
    const now = Date.now();
    const last = lastRevealRequest[wordIndex] || 0;
    const COOLDOWN_MS = 10000;
    if (now - last < COOLDOWN_MS) {
        flashCooldown(wordIndex);
        return;
    }
    lastRevealRequest[wordIndex] = now;
    ws.send(JSON.stringify({
        type: 'revealLetter',
        wordIndex: wordIndex
    }));
}

// Update leaderboard
function updateLeaderboard(players) {
    const list = $('#leaderboard-list');
    list.empty();
    
    if (players.length === 0) {
        list.html('<p class="empty-message">Waiting for players...</p>');
        return;
    }
    
    // Sort by score descending
    players.sort((a, b) => b.score - a.score);
    
    players.forEach((player, index) => {
        const item = $('<div>').addClass('leaderboard-item');
        if (index === 0 && player.score > 0) {
            item.addClass('leader');
        }
        
        item.html(`
            <span class="player-rank">${index + 1}.</span>
            <span class="player-name">${escapeHtml(player.name)}</span>
            <span class="player-score">${player.score}</span>
        `);
        
        list.append(item);
    });
}

// Add event to log
function addEventLog(message) {
    const list = $('#event-log-list');
    
    // Remove empty message
    list.find('.empty-message').remove();
    
    const item = $('<div>').addClass('log-item');
    const time = new Date().toLocaleTimeString();
    item.html(`<span class="log-time">${time}</span> ${escapeHtml(message)}`);
    
    list.prepend(item);
    
    // Keep only last 50 items
    if (list.children().length > 50) {
        list.children().last().remove();
    }
}

// Show winner modal with confetti
function showWinnerModal(data) {
    $('#winner-message').text(data.message);
    $('#winner-modal').removeClass('hidden');
    
    // Start confetti animation
    startConfetti();
    
    // Hide modal after 8 seconds
    setTimeout(() => {
        $('#winner-modal').addClass('hidden');
        stopConfetti();
    }, 8000);
}

// Confetti animation
let confettiInterval;
const confettiCanvas = document.getElementById('confetti-canvas');
const confettiCtx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
let confettiPieces = [];

function startConfetti() {
    if (!confettiCanvas || !confettiCtx) return;
    
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    
    // Create confetti pieces
    confettiPieces = [];
    for (let i = 0; i < 150; i++) {
        confettiPieces.push({
            x: Math.random() * confettiCanvas.width,
            y: Math.random() * confettiCanvas.height - confettiCanvas.height,
            r: Math.random() * 6 + 4,
            d: Math.random() * 150 + 10,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            tilt: Math.random() * 10 - 5,
            tiltAngle: 0,
            tiltAngleIncrement: Math.random() * 0.1 + 0.05
        });
    }
    
    confettiInterval = setInterval(drawConfetti, 33);
}

function drawConfetti() {
    if (!confettiCanvas || !confettiCtx) return;
    
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    
    confettiPieces.forEach((piece, index) => {
        confettiCtx.beginPath();
        confettiCtx.fillStyle = piece.color;
        confettiCtx.arc(piece.x, piece.y, piece.r, 0, Math.PI * 2, false);
        confettiCtx.fill();
        
        // Update position
        piece.y += Math.cos(piece.d) + 1 + piece.r / 2;
        piece.x += Math.sin(piece.d);
        piece.tiltAngle += piece.tiltAngleIncrement;
        piece.tilt = Math.sin(piece.tiltAngle) * 15;
        
        // Reset if off screen
        if (piece.y > confettiCanvas.height) {
            confettiPieces[index] = {
                ...piece,
                x: Math.random() * confettiCanvas.width,
                y: -20
            };
        }
    });
}

function stopConfetti() {
    if (confettiInterval) {
        clearInterval(confettiInterval);
        confettiInterval = null;
    }
    if (confettiCtx && confettiCanvas) {
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
}

// Theme management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    $('#theme-toggle').text(theme === 'light' ? '🌙' : '☀️');
}

// Utility: escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Flash a word item red to indicate cooldown
function flashCooldown(wordIndex) {
    const el = $(`.word-item[data-index="${wordIndex}"]`);
    if (!el.length) return;
    el.addClass('cooldown-flash');
    setTimeout(() => el.removeClass('cooldown-flash'), 350);
}
