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
   * Simple logic for incremental updates (not historical calculation)
   * @param {number} userId - ID of the user
   * @param {string} latestSubmissionTime - ISO timestamp of the newest submission
   */
  static async updateStreakOnNewSubmission(userId, latestSubmissionTime) {
    const { DateTime } = require('luxon');
    const tz = process.env.TZ || 'America/Lima';
    
    // Get current user data
    const user = await User.findById(userId);
    if (!user) return;
    
    // Convert new submission time to configured timezone
    // latestSubmissionTime is in "yyyy-MM-dd HH:mm:ss" format (UTC)
    const newSubmissionDate = DateTime.fromSQL(latestSubmissionTime, { zone: 'utc' })
      .setZone(tz)
      .startOf('day');
    const today = DateTime.now().setZone(tz).startOf('day');
    
    // Check if streak is currently active (last_streak_date is today or yesterday)
    let isStreakActive = false;
    if (user.last_streak_date && user.current_streak > 0) {
      // Interpretar la fecha de la BD (UTC 00:00) como fecha local (Local 00:00)
      const lastStreakDate = DateTime.fromJSDate(new Date(user.last_streak_date), { zone: 'utc' })
        .setZone(tz, { keepLocalTime: true })
        .startOf('day');
      
      const daysSinceLastStreak = Math.floor(today.diff(lastStreakDate, 'days').days);
      
      // Streak is active if last submission was today or yesterday
      isStreakActive = daysSinceLastStreak <= 1;
    }
    
    // If streak is active, don't update (let the tracker handle continuous updates)
    if (isStreakActive) {
      // Just update last_streak_date if the new submission is today and more recent
      const lastStreakDate = DateTime.fromJSDate(new Date(user.last_streak_date), { zone: 'utc' })
        .setZone(tz, { keepLocalTime: true })
        .startOf('day');
      
      if (newSubmissionDate.toMillis() > lastStreakDate.toMillis()) {
        await db.query(
          'UPDATE users SET last_streak_date = ? WHERE id = ?',
          [newSubmissionDate.toJSDate(), userId]
        );
      }
      return;
    }
    
    // Streak is inactive - check if we can reactivate it
    // Get the most recent submission before this one
    const [previousSubmissions] = await db.query(
      `SELECT submission_time 
       FROM submissions 
       WHERE user_id = ? AND submission_time < ?
       ORDER BY submission_time DESC 
       LIMIT 1`,
      [userId, latestSubmissionTime]
    );
    
    if (previousSubmissions.length === 0) {
      // This is the first submission, start streak at 1
      await db.query(
        'UPDATE users SET current_streak = 1, last_streak_date = ? WHERE id = ?',
        [newSubmissionDate.toJSDate(), userId]
      );
      return;
    }
    
    // Calculate time difference between previous and new submission
    const previousSubmissionDate = DateTime.fromJSDate(
      new Date(previousSubmissions[0].submission_time), 
      { zone: 'utc' }
    ).setZone(tz).startOf('day');
    
    const daysDiff = Math.floor(newSubmissionDate.diff(previousSubmissionDate, 'days').days);
    
    // If submissions are on the same day, keep current streak and update date
    if (daysDiff === 0) {
      await db.query(
        'UPDATE users SET last_streak_date = ? WHERE id = ?',
        [newSubmissionDate.toJSDate(), userId]
      );
    }
    // If submissions are on consecutive days (exactly 1 day apart), increment streak
    else if (daysDiff === 1) {
      const newStreak = (user.current_streak || 0) + 1;
      await db.query(
        'UPDATE users SET current_streak = ?, last_streak_date = ? WHERE id = ?',
        [newStreak, newSubmissionDate.toJSDate(), userId]
      );
    } 
    // More than 1 day difference, start new streak at 1
    else {
      await db.query(
        'UPDATE users SET current_streak = 1, last_streak_date = ? WHERE id = ?',
        [newSubmissionDate.toJSDate(), userId]
      );
    }
  }


  static async intelligentStreakCalculation(userId) {
    const { DateTime } = require('luxon');
    
    // Get timezone from environment (defaults to America/Lima)
    const tz = process.env.TZ || 'America/Lima';
    
    // Get all submission dates (stored as UTC in DB)
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
    
    // Convert UTC timestamps to TZ from .env and get unique dates
    const datesInTz = new Map();
    submissions.forEach(s => {
      // Determine DateTime from DB value (Date object or SQL string)
      // Force interpretation as UTC
      let dt;
      if (s.submission_time instanceof Date) {
        dt = DateTime.fromJSDate(s.submission_time, { zone: 'utc' });
      } else {
        dt = DateTime.fromSQL(String(s.submission_time), { zone: 'utc' });
      }
      
      // Convert to local timezone and get start of day
      dt = dt.setZone(tz).startOf('day');
      
      const dateKey = dt.toISODate();
      if (!datesInTz.has(dateKey)) {
        datesInTz.set(dateKey, dt.toJSDate());
      }
    });
    
    // Convert to array and sort descending
    const dates = Array.from(datesInTz.values()).sort((a, b) => b - a);
    
    // Get today in configured timezone
    const today = DateTime.now().setZone(tz).startOf('day').toJSDate();
    const lastSubmissionDate = dates[0];
    
    // Calculate days difference
    const daysSinceLastSubmission = Math.floor((today - lastSubmissionDate) / (1000 * 60 * 60 * 24));
    
    // If last submission is more than 1 day ago, streak is broken
    if (daysSinceLastSubmission > 1) {
      return { streak: 0, lastDate: null };
    }
    
    // Count consecutive days backwards
    let streak = 1;
    let currentExpectedDate = new Date(lastSubmissionDate);
    
    for (let i = 1; i < dates.length; i++) {
      const expectedDate = new Date(currentExpectedDate);
      expectedDate.setDate(expectedDate.getDate() - 1);
      expectedDate.setHours(0, 0, 0, 0);
      
      const actualDate = new Date(dates[i]);
      actualDate.setHours(0, 0, 0, 0);
      
      if (actualDate.getTime() === expectedDate.getTime()) {
        streak++;
        currentExpectedDate = actualDate;
      } else {
        break;
      }
    }
    
    return { streak, lastDate: lastSubmissionDate };
  }

  /**
   * Check if a user's streak is active (valid for today)
   * @param {string|Date} lastStreakDate - The last streak date from DB
   * @param {number} currentStreak - Current streak count
   * @returns {boolean} True if streak is active
   */
  static isStreakActive(lastStreakDate, currentStreak) {
    if (!lastStreakDate || !currentStreak || currentStreak <= 0) return false;
    
    // Lazy require to avoid circular dependencies if any, though Luxon is external
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
