// Performance monitoring and metrics collection
const os = require('os');
const fs = require('fs');
const path = require('path');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      connections: 0,
      rooms: 0,
      gamesStarted: 0,
      gamesCompleted: 0,
      cardsPlayed: 0,
      combosPlayed: 0,
      errors: 0,
      startTime: Date.now()
    };
    
    this.connectionHistory = [];
    this.performanceHistory = [];
    this.errorHistory = [];
    
    // Start monitoring interval
    this.startMonitoring();
  }

  // Track connection
  trackConnection(playerId, action = 'connect') {
    this.metrics.connections += action === 'connect' ? 1 : -1;
    this.connectionHistory.push({
      playerId,
      action,
      timestamp: Date.now()
    });
    
    // Keep only last 1000 connections
    if (this.connectionHistory.length > 1000) {
      this.connectionHistory = this.connectionHistory.slice(-1000);
    }
  }

  // Track room creation
  trackRoomCreated(roomId) {
    this.metrics.rooms += 1;
    this.logEvent('room_created', { roomId });
  }

  // Track room deletion
  trackRoomDeleted(roomId) {
    this.metrics.rooms = Math.max(0, this.metrics.rooms - 1);
    this.logEvent('room_deleted', { roomId });
  }

  // Track game start
  trackGameStarted(roomId, playerCount) {
    this.metrics.gamesStarted += 1;
    this.logEvent('game_started', { roomId, playerCount });
  }

  // Track game completion
  trackGameCompleted(roomId, winner, duration) {
    this.metrics.gamesCompleted += 1;
    this.logEvent('game_completed', { roomId, winner, duration });
  }

  // Track card play
  trackCardPlayed(roomId, playerId, cardType = 'single') {
    this.metrics.cardsPlayed += 1;
    if (cardType === 'combo') {
      this.metrics.combosPlayed += 1;
    }
    this.logEvent('card_played', { roomId, playerId, cardType });
  }

  // Track errors
  trackError(error, context = {}) {
    this.metrics.errors += 1;
    this.errorHistory.push({
      error: error.message || error,
      stack: error.stack,
      context,
      timestamp: Date.now()
    });
    
    // Keep only last 100 errors
    if (this.errorHistory.length > 100) {
      this.errorHistory = this.errorHistory.slice(-100);
    }
  }

  // Log general events
  logEvent(eventType, data = {}) {
    const event = {
      type: eventType,
      data,
      timestamp: Date.now()
    };
    
    // Store in performance history
    this.performanceHistory.push(event);
    
    // Keep only last 1000 events
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000);
    }
  }

  // Get current metrics
  getMetrics() {
    const uptime = Date.now() - this.metrics.startTime;
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      ...this.metrics,
      uptime: Math.floor(uptime / 1000), // seconds
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        loadAverage: os.loadavg(),
        freeMemory: Math.round(os.freemem() / 1024 / 1024), // MB
        totalMemory: Math.round(os.totalmem() / 1024 / 1024) // MB
      },
      rates: {
        gamesPerHour: this.calculateRate(this.metrics.gamesStarted, uptime),
        cardsPerMinute: this.calculateRate(this.metrics.cardsPlayed, uptime, 60000),
        errorsPerHour: this.calculateRate(this.metrics.errors, uptime)
      }
    };
  }

  // Calculate rate per time period
  calculateRate(count, timeMs, periodMs = 3600000) {
    if (timeMs === 0) return 0;
    return Math.round((count * periodMs) / timeMs * 100) / 100;
  }

  // Get performance history
  getPerformanceHistory(limit = 100) {
    return this.performanceHistory.slice(-limit);
  }

  // Get error history
  getErrorHistory(limit = 50) {
    return this.errorHistory.slice(-limit);
  }

  // Get connection history
  getConnectionHistory(limit = 100) {
    return this.connectionHistory.slice(-limit);
  }

  // Start monitoring interval
  startMonitoring() {
    setInterval(() => {
      const metrics = this.getMetrics();
      
      // Log performance metrics every 5 minutes
      console.log('📊 Performance Metrics:', {
        uptime: `${metrics.uptime}s`,
        connections: metrics.connections,
        rooms: metrics.rooms,
        gamesStarted: metrics.gamesStarted,
        gamesCompleted: metrics.gamesCompleted,
        memory: `${metrics.memory.heapUsed}MB`,
        errors: metrics.errors
      });
      
      // Save metrics to file every hour
      if (metrics.uptime % 3600 === 0) {
        this.saveMetricsToFile(metrics);
      }
      
    }, 300000); // 5 minutes
  }

  // Save metrics to file
  saveMetricsToFile(metrics) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      metrics,
      performanceHistory: this.getPerformanceHistory(50),
      errorHistory: this.getErrorHistory(10)
    };
    
    const logFile = path.join(__dirname, 'logs', `metrics-${new Date().toISOString().split('T')[0]}.json`);
    
    // Ensure logs directory exists
    const logsDir = path.dirname(logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Append to log file
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  }

  // Get health status
  getHealthStatus() {
    const metrics = this.getMetrics();
    const memoryUsagePercent = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
    const errorRate = metrics.rates.errorsPerHour;
    
    let status = 'healthy';
    let issues = [];
    
    // Check memory usage
    if (memoryUsagePercent > 90) {
      status = 'critical';
      issues.push('High memory usage');
    } else if (memoryUsagePercent > 75) {
      status = 'warning';
      issues.push('Elevated memory usage');
    }
    
    // Check error rate
    if (errorRate > 10) {
      status = 'critical';
      issues.push('High error rate');
    } else if (errorRate > 5) {
      status = 'warning';
      issues.push('Elevated error rate');
    }
    
    // Check uptime
    if (metrics.uptime < 60) {
      status = 'warning';
      issues.push('Recently started');
    }
    
    return {
      status,
      issues,
      metrics: {
        uptime: metrics.uptime,
        memoryUsage: Math.round(memoryUsagePercent),
        errorRate: Math.round(errorRate * 100) / 100,
        connections: metrics.connections,
        rooms: metrics.rooms
      }
    };
  }

  // Reset metrics (for testing)
  reset() {
    this.metrics = {
      connections: 0,
      rooms: 0,
      gamesStarted: 0,
      gamesCompleted: 0,
      cardsPlayed: 0,
      combosPlayed: 0,
      errors: 0,
      startTime: Date.now()
    };
    this.connectionHistory = [];
    this.performanceHistory = [];
    this.errorHistory = [];
  }
}

module.exports = { PerformanceMonitor };
