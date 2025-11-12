// Database integration for persistent game storage
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class GameDatabase {
  constructor(dbPath = './games.db') {
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  init() {
    // Create tables for persistent storage
    this.db.serialize(() => {
      // Games table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT UNIQUE NOT NULL,
          game_state TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'active'
        )
      `);

      // Players table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id TEXT NOT NULL,
          room_id TEXT NOT NULL,
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          disconnected_at DATETIME,
          FOREIGN KEY (room_id) REFERENCES games (room_id)
        )
      `);

      // Game logs table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS game_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT NOT NULL,
          player_id TEXT,
          action TEXT NOT NULL,
          data TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (room_id) REFERENCES games (room_id)
        )
      `);

      // Statistics table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS game_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          games_played INTEGER DEFAULT 0,
          games_won INTEGER DEFAULT 0,
          cards_played INTEGER DEFAULT 0,
          combos_played INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (room_id) REFERENCES games (room_id)
        )
      `);
    });
  }

  // Save game state
  saveGameState(roomId, gameState) {
    return new Promise((resolve, reject) => {
      const stateJson = JSON.stringify(gameState);
      this.db.run(
        `INSERT OR REPLACE INTO games (room_id, game_state, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [roomId, stateJson],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  // Load game state
  loadGameState(roomId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT game_state FROM games WHERE room_id = ? AND status = 'active'`,
        [roomId],
        (err, row) => {
          if (err) {
            reject(err);
          } else if (row) {
            try {
              const gameState = JSON.parse(row.game_state);
              resolve(gameState);
            } catch (parseErr) {
              reject(parseErr);
            }
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  // Add player to room
  addPlayer(roomId, playerId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO players (player_id, room_id) VALUES (?, ?)`,
        [playerId, roomId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  // Remove player from room
  removePlayer(roomId, playerId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE players SET disconnected_at = CURRENT_TIMESTAMP WHERE player_id = ? AND room_id = ?`,
        [playerId, roomId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Log game action
  logAction(roomId, playerId, action, data = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO game_logs (room_id, player_id, action, data) VALUES (?, ?, ?, ?)`,
        [roomId, playerId, action, data ? JSON.stringify(data) : null],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  // Update player statistics
  updatePlayerStats(roomId, playerId, stats) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO game_stats (room_id, player_id, games_played, games_won, cards_played, combos_played, updated_at) 
         VALUES (?, ?, COALESCE((SELECT games_played FROM game_stats WHERE room_id = ? AND player_id = ?), 0) + ?, 
                 COALESCE((SELECT games_won FROM game_stats WHERE room_id = ? AND player_id = ?), 0) + ?,
                 COALESCE((SELECT cards_played FROM game_stats WHERE room_id = ? AND player_id = ?), 0) + ?,
                 COALESCE((SELECT combos_played FROM game_stats WHERE room_id = ? AND player_id = ?), 0) + ?,
                 CURRENT_TIMESTAMP)`,
        [roomId, playerId, roomId, playerId, stats.gamesPlayed || 0,
         roomId, playerId, stats.gamesWon || 0,
         roomId, playerId, stats.cardsPlayed || 0,
         roomId, playerId, stats.combosPlayed || 0],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Get active games
  getActiveGames() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT room_id, game_state, created_at FROM games WHERE status = 'active'`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const games = rows.map(row => ({
              roomId: row.room_id,
              gameState: JSON.parse(row.game_state),
              createdAt: row.created_at
            }));
            resolve(games);
          }
        }
      );
    });
  }

  // Get all active games for room recovery (returns raw data)
  getAllActiveGames() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT room_id, game_state, created_at FROM games WHERE status = 'active'`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  // Archive completed game
  archiveGame(roomId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE games SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE room_id = ?`,
        [roomId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Get player statistics
  getPlayerStats(playerId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM game_stats WHERE player_id = ? ORDER BY updated_at DESC`,
        [playerId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  // Clean up old games (older than 24 hours)
  cleanupOldGames() {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE games SET status = 'archived' WHERE created_at < datetime('now', '-24 hours') AND status = 'active'`,
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Delete old games and related data older than N minutes (default 10)
  deleteOldGames(minutes = 10) {
    const offset = `-${minutes} minutes`;
    const selectOldRooms = `
    SELECT room_id FROM games 
    WHERE updated_at < datetime('now', ?) 
      AND status IN ('active', 'completed', 'archived')
  `;
    return new Promise((resolve, reject) => {
      this.db.all(selectOldRooms, [offset], (err, rows) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve(0);

        const roomIds = rows.map(r => r.room_id);
        const placeholders = roomIds.map(() => '?').join(',');

        const deletes = [
          { sql: `DELETE FROM game_logs WHERE room_id IN (${placeholders})`, params: roomIds },
          { sql: `DELETE FROM players WHERE room_id IN (${placeholders})`, params: roomIds },
          { sql: `DELETE FROM game_stats WHERE room_id IN (${placeholders})`, params: roomIds },
          { sql: `DELETE FROM games WHERE room_id IN (${placeholders})`, params: roomIds },
        ];

        const runNext = (i = 0) => {
          if (i >= deletes.length) return resolve(roomIds.length);
          const { sql, params } = deletes[i];
          this.db.run(sql, params, (e) => (e ? reject(e) : runNext(i + 1)));
        };
        runNext();
      });
    });
  }

  // Delete ALL rooms and related data
  clearAllRooms() {
    return new Promise((resolve, reject) => {
      const results = { gameLogsDeleted: 0, playersDeleted: 0, statsDeleted: 0, gamesDeleted: 0 };

      const runWithChanges = (sql) => new Promise((res, rej) => {
        this.db.run(sql, function(err) {
          if (err) return rej(err);
          res(this.changes || 0);
        });
      });

      this.db.serialize(async () => {
        try {
          await runWithChanges('BEGIN IMMEDIATE');
          results.gameLogsDeleted = await runWithChanges('DELETE FROM game_logs');
          results.playersDeleted = await runWithChanges('DELETE FROM players');
          results.statsDeleted = await runWithChanges('DELETE FROM game_stats');
          results.gamesDeleted = await runWithChanges('DELETE FROM games');
          await runWithChanges('COMMIT');
          resolve(results);
        } catch (err) {
          try { await runWithChanges('ROLLBACK'); } catch (_) {}
          reject(err);
        }
      });
    });
  }

  // Close database connection
  close() {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        }
        resolve();
      });
    });
  }
}

module.exports = { GameDatabase };
