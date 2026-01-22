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


  static async intelligentStreakCalculation(userId) {
    const { DateTime } = require('luxon');
    
    // Get timezone from environment (defaults to America/Lima)
    const tz = process.env.TZ || 'America/Lima';
    
    // Get all submission dates (stored as UTC in DB)
    const [submissions] = await db.query(
      `SELECT DISTINCT DATE(submission_time) as date, submission_time
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
      // submission_time is stored as UTC
      const dt = DateTime.fromJSDate(new Date(s.submission_time), { zone: 'utc' })
        .setZone(tz)
        .startOf('day');
      
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
}

module.exports = User;
