const db = require('../config/database');

class Submission {
  static async create(userId, submission) {
    const { contestId, problemIndex, problemName, rating, tags, submissionTime, platform = 'CODEFORCES' } = submission;
    
    const [result] = await db.query(
      `INSERT INTO submissions 
       (user_id, platform, contest_id, problem_index, problem_name, rating, tags, submission_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, contest_id, problem_index) DO UPDATE SET
         platform = EXCLUDED.platform,
         problem_name = EXCLUDED.problem_name,
         rating = EXCLUDED.rating,
         tags = EXCLUDED.tags,
         submission_time = GREATEST(submissions.submission_time, EXCLUDED.submission_time)
       RETURNING id`,
      [userId, platform, contestId, problemIndex, problemName, rating, JSON.stringify(tags), submissionTime]
    );
    
    return result.insertId || result.affectedRows;
  }

  static async bulkCreate(userId, submissions) {
    if (!submissions.length) return 0;

    const values = submissions.map(sub => [
      userId,
      sub.platform || 'CODEFORCES',
      sub.contestId,
      sub.problemIndex,
      sub.problemName,
      sub.rating,
      JSON.stringify(sub.tags),
      sub.submissionTime
    ]);

    let parameterIndex = 1;
    const placeholders = values
      .map(row => `(${row.map(() => `$${parameterIndex++}`).join(', ')})`)
      .join(', ');
    const flatValues = values.flat();

    const [result] = await db.query(
      `INSERT INTO submissions 
       (user_id, platform, contest_id, problem_index, problem_name, rating, tags, submission_time)
       VALUES ${placeholders}
       ON CONFLICT (user_id, contest_id, problem_index) DO UPDATE SET
         platform = EXCLUDED.platform,
         problem_name = EXCLUDED.problem_name,
         rating = EXCLUDED.rating,
         tags = EXCLUDED.tags,
         submission_time = GREATEST(submissions.submission_time, EXCLUDED.submission_time)`,
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
    let query = 'SELECT * FROM submissions WHERE user_id = $1';
    const params = [userId];

    // Filtros
    if (filters.ratingMin !== undefined) {
      params.push(filters.ratingMin);
      query += ` AND (rating >= $${params.length} OR rating IS NULL)`;
    }

    if (filters.ratingMax !== undefined) {
      params.push(filters.ratingMax);
      query += ` AND (rating <= $${params.length} OR rating IS NULL)`;
    }

    if (filters.dateFrom) {
      params.push(filters.dateFrom);
      query += ` AND submission_time >= $${params.length}`;
    }

    if (filters.dateTo) {
      params.push(filters.dateTo);
      query += ` AND submission_time <= $${params.length}`;
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
    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

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
    let query = 'SELECT COUNT(*) as total FROM submissions WHERE user_id = $1';
    const params = [userId];

    if (filters.ratingMin !== undefined) {
      params.push(filters.ratingMin);
      query += ` AND (rating >= $${params.length} OR rating IS NULL)`;
    }

    if (filters.ratingMax !== undefined) {
      params.push(filters.ratingMax);
      query += ` AND (rating <= $${params.length} OR rating IS NULL)`;
    }

    if (filters.dateFrom) {
      params.push(filters.dateFrom);
      query += ` AND submission_time >= $${params.length}`;
    }

    if (filters.dateTo) {
      params.push(filters.dateTo);
      query += ` AND submission_time <= $${params.length}`;
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
       WHERE user_id = $1
       ORDER BY submission_time DESC 
       LIMIT $2`,
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
      'SELECT id FROM submissions WHERE user_id = $1 AND contest_id = $2 AND problem_index = $3',
      [userId, contestId, problemIndex]
    );
    return rows.length > 0;
  }

  static async getLastSubmissionTimeByPlatform(userId, platform) {
    const [rows] = await db.query(
      `SELECT MAX(submission_time) AS last_submission_time
       FROM submissions
       WHERE user_id = $1 AND platform = $2`,
      [userId, platform]
    );

    return rows[0]?.last_submission_time || null;
  }
}

module.exports = Submission;
