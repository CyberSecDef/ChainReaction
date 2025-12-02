// Shared functions for both client and server

// Round configurations: how many words in each round
const ROUND_CONFIGS = [
    5,  // Round 1
    4,  // Round 2
    6,  // Round 3
    4,  // Round 4
    7,  // Round 5
    4,  // Round 6
    7,  // Round 7
    4,  // Round 8
    7,  // Round 9
    5   // Round 10
];

const TOTAL_ROUNDS = 10;

// Check if a guess matches the target word (case-insensitive)
function isCorrectGuess(guess, target) {
    if (!guess || !target) return false;
    return guess.toLowerCase().trim() === target.toLowerCase().trim();
}

// Get number of words for a specific round (1-indexed)
function getWordsForRound(roundNumber) {
    if (roundNumber < 1 || roundNumber > TOTAL_ROUNDS) return 5;
    return ROUND_CONFIGS[roundNumber - 1];
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ROUND_CONFIGS,
        TOTAL_ROUNDS,
        isCorrectGuess,
        getWordsForRound
    };
}
