const path = require('path');
const { GameDatabase } = require('./database');

(async () => {
  const dbPath = path.resolve(__dirname, 'games.db');
  const db = new GameDatabase(dbPath);
  try {
    const result = await db.clearAllRooms();
    console.log('All rooms cleared from database:', result);
  } catch (err) {
    console.error('Failed to clear rooms:', err);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();


