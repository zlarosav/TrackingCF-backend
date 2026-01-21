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
}

module.exports = User;
