const db = require('../config/database');

class User {
  static async findAll() {
    const [rows] = await db.query(`
      SELECT u.*, 
             COALESCE(s.total_score, 0) as total_score,
             COALESCE(s.count_no_rating, 0) as count_no_rating,
             COALESCE(s.count_800_900, 0) as count_800_900,
             COALESCE(s.count_1000, 0) as count_1000,
             COALESCE(s.count_1100, 0) as count_1100,
             COALESCE(s.count_1200_plus, 0) as count_1200_plus
      FROM users u
      LEFT JOIN user_stats s ON u.id = s.user_id
      ORDER BY COALESCE(s.total_score, 0) DESC, u.handle ASC
    `);
    return rows;
  }

  static async findByHandle(handle) {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE handle = ?',
      [handle]
    );
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );
    return rows[0];
  }

  static async create(handle) {
    const [result] = await db.query(
      'INSERT INTO users (handle) VALUES (?)',
      [handle]
    );
    return result.insertId;
  }

  static async delete(handle) {
    const [result] = await db.query(
      'DELETE FROM users WHERE handle = ?',
      [handle]
    );
    return result.affectedRows > 0;
  }

  static async updateLastUpdated(id) {
    await db.query(
      'UPDATE users SET last_updated = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  static async updateUserInfo(id, info) {
    const { avatarUrl, rating, rank, lastSubmissionTime } = info;
    await db.query(
      `UPDATE users 
       SET avatar_url = ?, rating = ?, \`rank\` = ?, last_submission_time = ?
       WHERE id = ?`,
      [avatarUrl, rating, rank, lastSubmissionTime, id]
    );
  }

  static async getLastSubmissionTime(id) {
    const [rows] = await db.query(
      'SELECT last_submission_time FROM users WHERE id = ?',
      [id]
    );
    return rows[0]?.last_submission_time;
  }

  static async updateEnabled(id, enabled) {
    await db.query(
      'UPDATE users SET enabled = ? WHERE id = ?',
      [enabled, id]
    );
  }

  /**
   * Update streak when new submissions are detected
   * Uses historical calculation to ensure robustness against resets
   * @param {number} userId - ID of the user
   * @param {string} latestSubmissionTime - ISO timestamp of the newest submission (unused for calc, but kept for signature)
   */
  static async updateStreakOnNewSubmission(userId, latestSubmissionTime) {
    // Recalculate streak from scratch using history
    // This repairs any broken streaks and ensures consistency
    const streakResult = await User.intelligentStreakCalculation(userId);
    
    // Update user record with new streak info
    if (streakResult.streak > 0) {
      await db.query(
        'UPDATE users SET current_streak = ?, last_streak_date = ? WHERE id = ?',
        [streakResult.streak, streakResult.lastDate, userId]
      );
    } else {
       // Optional: Set to 0 if we want to enforce it, though usually we just leave it
       // and let the daily reset job handle zeroing it out if it expires.
       // But to be consistent with "recalculation", if history says 0, we should probably set 0.
       // However, to avoid "flashing" 0 on a valid day before this runs, we'll trust the result.
       // If streak is 0, let's update it to ensure truth.
       await db.query(
        'UPDATE users SET current_streak = 0, last_streak_date = NULL WHERE id = ?',
        [userId]
       );
    }
  }

  /**
   * Calculates valid streak based on submission history
   * Handles timezones and strict day consecutive logic using Luxon
   * @param {number} userId 
   * @returns {Promise<{streak: number, lastDate: Date|null}>}
   */
  static async intelligentStreakCalculation(userId) {
    const { DateTime } = require('luxon');
    
    // Get timezone from environment (defaults to America/Lima)
    const tz = process.env.TZ || 'America/Lima';
    
    // Get all submission dates (stored as UTC in DB)
    const [submissions] = await db.query(
      `SELECT submission_time
       FROM submissions 
       WHERE user_id = ? 
       ORDER BY submission_time DESC`,
      [userId]
    );
    
    if (submissions.length === 0) {
      return { streak: 0, lastDate: null };
    }
    
    // 1. Process all dates into Unique Strings representing Local Days (YYYY-MM-DD)
    const uniqueDays = new Set();
    const dayToDateMap = new Map(); // Store one Date object per day for reference

    submissions.forEach(s => {
      // Determine DateTime from DB value (Date object or SQL string)
      let dt;
      if (s.submission_time instanceof Date) {
        dt = DateTime.fromJSDate(s.submission_time, { zone: 'utc' });
      } else {
        dt = DateTime.fromSQL(String(s.submission_time), { zone: 'utc' });
      }
      
      // Convert to local timezone
      const localDt = dt.setZone(tz);
      const dayKey = localDt.toISODate(); // YYYY-MM-DD in local time
      
      uniqueDays.add(dayKey);
      if (!dayToDateMap.has(dayKey)) {
        dayToDateMap.set(dayKey, localDt.toJSDate()); // Keep JS Date for return
      }
    });

    // 2. Sort unique days descending
    const sortedDays = Array.from(uniqueDays).sort((a, b) => b.localeCompare(a));
    
    if (sortedDays.length === 0) return { streak: 0, lastDate: null };

    // 3. Check if the most recent submission was today or yesterday
    // If last submission was before yesterday, streak is already broken (0)
    const today = DateTime.now().setZone(tz);
    const todayStr = today.toISODate();
    const yesterdayStr = today.minus({ days: 1 }).toISODate();
    
    const lastSubmissionDay = sortedDays[0];
    
    // If the last submission is not today AND not yesterday, streak is 0.
    if (lastSubmissionDay !== todayStr && lastSubmissionDay !== yesterdayStr) {
      return { streak: 0, lastDate: null }; // Or lastDate could be returned for "last active", but streak is 0
    }

    // 4. Count consecutive days backwards
    let streak = 1;
    let currentDayStr = lastSubmissionDay; // Start with the latest valid day

    // We iterate from the second element (index 1)
    for (let i = 1; i < sortedDays.length; i++) {
        const previousDayStr = sortedDays[i];
        
        // Calculate expected previous day (currentDay - 1 day)
        const currentDt = DateTime.fromISO(currentDayStr, { zone: tz });
        const expectedPrevDt = currentDt.minus({ days: 1 });
        const expectedPrevStr = expectedPrevDt.toISODate();

        if (previousDayStr === expectedPrevStr) {
            streak++;
            currentDayStr = previousDayStr;
        } else {
            // Gap found, stop counting
            break;
        }
    }
    
    // Return the actual Date object corresponding to the latest submission day
    return { 
        streak, 
        lastDate: dayToDateMap.get(lastSubmissionDay) 
    };
  }

  /**
   * Check if a user's streak is active (valid for today)
   * @param {string|Date} lastStreakDate - The last streak date from DB
   * @param {number} currentStreak - Current streak count
   * @returns {boolean} True if streak is active
   */
  static isStreakActive(lastStreakDate, currentStreak) {
    if (!lastStreakDate || !currentStreak || currentStreak <= 0) return false;
    
    const { DateTime } = require('luxon');
    const tz = process.env.TZ || 'America/Lima';
    const today = DateTime.now().setZone(tz).startOf('day');

    // Interpretar la fecha de la BD (UTC 00:00) como fecha local (Local 00:00)
    const lastDate = DateTime.fromJSDate(new Date(lastStreakDate), { zone: 'utc' })
      .setZone(tz, { keepLocalTime: true })
      .startOf('day');
      
    const daysDiff = Math.floor(today.diff(lastDate, 'days').days);
    return daysDiff === 0;
  }
}

module.exports = User;
