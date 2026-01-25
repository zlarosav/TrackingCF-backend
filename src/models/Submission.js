const db = require('../config/database');

class Submission {
  static async create(userId, submission) {
    const { contestId, problemIndex, problemName, rating, tags, submissionTime } = submission;
    
    const [result] = await db.query(
      `INSERT INTO submissions 
       (user_id, contest_id, problem_index, problem_name, rating, tags, submission_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id=id`,
      [userId, contestId, problemIndex, problemName, rating, JSON.stringify(tags), submissionTime]
    );
    
    return result.insertId || result.affectedRows;
  }

  static async bulkCreate(userId, submissions) {
    if (!submissions.length) return 0;

    const values = submissions.map(sub => [
      userId,
      sub.contestId,
      sub.problemIndex,
      sub.problemName,
      sub.rating,
      JSON.stringify(sub.tags),
      sub.submissionTime
    ]);

    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    const flatValues = values.flat();

    const [result] = await db.query(
      `INSERT INTO submissions 
       (user_id, contest_id, problem_index, problem_name, rating, tags, submission_time)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE id=id`,
      flatValues
    );

    return result.affectedRows;
  }

  /**
   * Helper to format submission date fields to ISO strings
   */
  static formatSubmission(sub) {
    if (!sub) return null;
    const formatted = { ...sub };
    
    if (formatted.submission_time instanceof Date) {
      formatted.submission_time = formatted.submission_time.toISOString();
    }
    
    return formatted;
  }

  static async findByUser(userId, filters = {}) {
    let query = 'SELECT * FROM submissions WHERE user_id = ?';
    const params = [userId];

    // Filtros
    if (filters.ratingMin !== undefined) {
      query += ' AND (rating >= ? OR rating IS NULL)';
      params.push(filters.ratingMin);
    }

    if (filters.ratingMax !== undefined) {
      query += ' AND (rating <= ? OR rating IS NULL)';
      params.push(filters.ratingMax);
    }

    if (filters.dateFrom) {
      query += ' AND submission_time >= ?';
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      query += ' AND submission_time <= ?';
      params.push(filters.dateTo);
    }

    if (filters.noRating === 'true') {
      query += ' AND rating IS NULL';
    }

    // Ordenamiento
    const sortBy = filters.sortBy || 'submission_time';
    const order = filters.order === 'asc' ? 'ASC' : 'DESC';
    
    if (sortBy === 'rating') {
      query += ` ORDER BY rating ${order}, submission_time DESC`;
    } else {
      query += ` ORDER BY submission_time ${order}`;
    }

    // Paginación
    const limit = parseInt(filters.limit) || 100;
    const offset = parseInt(filters.offset) || 0;
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await db.query(query, params);
    
    // Parse JSON tags con manejo de errores
    return rows.map(row => {
      let parsedTags = [];
      try {
        if (typeof row.tags === 'string') {
          parsedTags = JSON.parse(row.tags);
        } else if (Array.isArray(row.tags)) {
          parsedTags = row.tags;
        }
      } catch (err) {
        console.error(`Error parseando tags para submission ${row.id}:`, err.message);
        parsedTags = [];
      }
      
      return {
        ...row,
        tags: parsedTags
      };
    });
  }

  static async countByUser(userId, filters = {}) {
    let query = 'SELECT COUNT(*) as total FROM submissions WHERE user_id = ?';
    const params = [userId];

    if (filters.ratingMin !== undefined) {
      query += ' AND (rating >= ? OR rating IS NULL)';
      params.push(filters.ratingMin);
    }

    if (filters.ratingMax !== undefined) {
      query += ' AND (rating <= ? OR rating IS NULL)';
      params.push(filters.ratingMax);
    }

    if (filters.dateFrom) {
      query += ' AND submission_time >= ?';
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      query += ' AND submission_time <= ?';
      params.push(filters.dateTo);
    }

    if (filters.noRating === 'true') {
      query += ' AND rating IS NULL';
    }

    const [rows] = await db.query(query, params);
    return rows[0].total;
  }

  static async findLatestByUser(userId, limit = 10) {
    const [rows] = await db.query(
      `SELECT * FROM submissions 
       WHERE user_id = ? 
       ORDER BY submission_time DESC 
       LIMIT ?`,
      [userId, limit]
    );

    return rows.map(row => {
      let parsedTags = [];
      try {
        if (typeof row.tags === 'string') {
          parsedTags = JSON.parse(row.tags);
        } else if (Array.isArray(row.tags)) {
          parsedTags = row.tags;
        }
      } catch (err) {
        console.error(`Error parseando tags para submission ${row.id}:`, err.message);
        parsedTags = [];
      }
      
      return {
        ...row,
        tags: parsedTags
      };
    });
  }

  static async checkExists(userId, contestId, problemIndex) {
    const [rows] = await db.query(
      'SELECT id FROM submissions WHERE user_id = ? AND contest_id = ? AND problem_index = ?',
      [userId, contestId, problemIndex]
    );
    return rows.length > 0;
  }
}

module.exports = Submission;
