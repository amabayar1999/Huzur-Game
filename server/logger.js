// Transaction logger for debugging and monitoring
const fs = require('fs');
const path = require('path');

class Logger {
  constructor(logDir = './logs') {
    this.logDir = logDir;
    this.transactionLog = [];
    this.maxMemoryEntries = 1000; // Keep last 1000 entries in memory
    
    // Create log directory if it doesn't exist
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch (err) {
        console.error('Failed to create log directory:', err);
      }
    }
  }

  // Log a transaction with context
  logTransaction(type, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      data,
      id: this.generateTransactionId()
    };

    // Add to in-memory log
    this.transactionLog.push(entry);

    // Keep only last maxMemoryEntries
    if (this.transactionLog.length > this.maxMemoryEntries) {
      this.transactionLog.shift();
    }

    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${entry.id}] ${type}:`, JSON.stringify(data, null, 2));
    }

    // Write to file asynchronously (non-blocking)
    this.writeToFile(entry);

    return entry.id;
  }

  generateTransactionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  writeToFile(entry) {
    if (!this.logDir) return;

    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `transactions-${date}.log`);
    
    const logLine = JSON.stringify(entry) + '\n';

    fs.appendFile(logFile, logLine, (err) => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
  }

  // Get recent transactions for debugging
  getRecentTransactions(count = 100) {
    return this.transactionLog.slice(-count);
  }

  // Get transactions by type
  getTransactionsByType(type, count = 100) {
    return this.transactionLog
      .filter(entry => entry.type === type)
      .slice(-count);
  }

  // Get transactions by player
  getTransactionsByPlayer(playerId, count = 100) {
    return this.transactionLog
      .filter(entry => 
        entry.data.playerId === playerId || 
        entry.data.player === playerId
      )
      .slice(-count);
  }

  // Log specific event types
  logRoomCreated(roomId, creator) {
    return this.logTransaction('ROOM_CREATED', { roomId, creator });
  }

  logPlayerJoined(roomId, playerId) {
    return this.logTransaction('PLAYER_JOINED', { roomId, playerId });
  }

  logPlayerLeft(roomId, playerId) {
    return this.logTransaction('PLAYER_LEFT', { roomId, playerId });
  }

  logGameStarted(roomId, playerCount) {
    return this.logTransaction('GAME_STARTED', { roomId, playerCount });
  }

  logCardPlayed(roomId, playerId, card, moveId) {
    return this.logTransaction('CARD_PLAYED', { roomId, playerId, card, moveId });
  }

  logPilePickup(roomId, playerId) {
    return this.logTransaction('PILE_PICKUP', { roomId, playerId });
  }

  logError(context, error, additionalData = {}) {
    return this.logTransaction('ERROR', {
      context,
      error: error.message || error,
      stack: error.stack,
      ...additionalData
    });
  }

  logRateLimitViolation(playerId, actionCount) {
    return this.logTransaction('RATE_LIMIT_VIOLATION', { playerId, actionCount });
  }

  logSuspiciousActivity(playerId, activityType, details) {
    return this.logTransaction('SUSPICIOUS_ACTIVITY', { 
      playerId, 
      activityType, 
      details 
    });
  }

  // Get summary statistics
  getStatistics() {
    const stats = {
      totalTransactions: this.transactionLog.length,
      byType: {},
      recentErrors: []
    };

    this.transactionLog.forEach(entry => {
      stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
      
      if (entry.type === 'ERROR') {
        stats.recentErrors.push(entry);
      }
    });

    stats.recentErrors = stats.recentErrors.slice(-10); // Last 10 errors

    return stats;
  }

  // Clear in-memory log (keep files)
  clearMemory() {
    this.transactionLog = [];
  }
}

// Export singleton instance
const logger = new Logger();

module.exports = { Logger, logger };

