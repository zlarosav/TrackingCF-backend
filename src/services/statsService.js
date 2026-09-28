const db = require('../config/database');

/**
 * Calcula el score basado en el rating del problema
 * @param {number|null} rating - Rating del problema
 * @returns {number} Score del problema
 */
function calculateScore(rating) {
  if (rating === null || rating === undefined) return 1; // No rating
  if (rating >= 800 && rating <= 900) return 1; // 800-900
  if (rating === 1000) return 2; // 1000
  if (rating === 1100) return 3; // 1100
  if (rating >= 1200) return 5; // 1200+
  return 0;
}

/**
 * Determina la categoría de rating de un problema
 * @param {number|null} rating - Rating del problema
 * @returns {string} Categoría
 */
function getRatingCategory(rating) {
  if (rating === null || rating === undefined) return 'no_rating';
  if (rating >= 800 && rating <= 900) return '800_900';
  if (rating === 1000) return '1000';
  if (rating === 1100) return '1100';
  if (rating >= 1200) return '1200_plus';
  return 'other';
}

/**
 * Calcula y actualiza las estadísticas de un usuario
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Estadísticas calculadas
 */
async function calculateUserStats(userId) {
  try {
    // Obtener todas las submissions del usuario
    const [submissions] = await db.query(
      'SELECT rating FROM submissions WHERE user_id = $1',
      [userId]
    );

    // Inicializar contadores
    const stats = {
      total_score: 0,
      count_no_rating: 0,
      count_800_900: 0,
      count_1000: 0,
      count_1100: 0,
      count_1200_plus: 0
    };

    // Calcular estadísticas
    submissions.forEach(sub => {
      const rating = sub.rating;
      stats.total_score += calculateScore(rating);

      const category = getRatingCategory(rating);
      switch (category) {
        case 'no_rating':
          stats.count_no_rating++;
          break;
        case '800_900':
          stats.count_800_900++;
          break;
        case '1000':
          stats.count_1000++;
          break;
        case '1100':
          stats.count_1100++;
          break;
        case '1200_plus':
          stats.count_1200_plus++;
          break;
      }
    });

    // Actualizar en la tabla user_stats
    await db.query(
      `INSERT INTO user_stats 
       (user_id, total_score, count_no_rating, count_800_900, count_1000, count_1100, count_1200_plus)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         total_score = EXCLUDED.total_score,
         count_no_rating = EXCLUDED.count_no_rating,
         count_800_900 = EXCLUDED.count_800_900,
         count_1000 = EXCLUDED.count_1000,
         count_1100 = EXCLUDED.count_1100,
         count_1200_plus = EXCLUDED.count_1200_plus`,
      [
        userId,
        stats.total_score,
        stats.count_no_rating,
        stats.count_800_900,
        stats.count_1000,
        stats.count_1100,
        stats.count_1200_plus
      ]
    );

    return stats;
  } catch (err) {
    console.error('❌ Error calculando stats:', err.message);
    throw err;
  }
}

/**
 * Obtiene estadísticas detalladas de un usuario para gráficos
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Estadísticas detalladas
 */
async function getUserDetailedStats(userId) {
  try {
    // Distribución por rating
    const [ratingDist] = await db.query(
      `SELECT category, count
       FROM (
         SELECT
           CASE
             WHEN rating IS NULL THEN 'Sin rating'
             WHEN rating >= 800 AND rating <= 900 THEN '800-900'
             WHEN rating = 1000 THEN '1000'
             WHEN rating = 1100 THEN '1100'
             WHEN rating >= 1200 THEN '1200+'
             ELSE 'Otro'
           END AS category,
           COUNT(*) AS count
         FROM submissions
         WHERE user_id = $1
         GROUP BY 1
       ) AS rating_distribution
       ORDER BY array_position(
         ARRAY['Sin rating', '800-900', '1000', '1100', '1200+', 'Otro']::text[],
         category
       )`,
      [userId]
    );

    // PostgreSQL convierte el timestamp UTC a la zona indicada en la consulta.
    const tz = process.env.TZ || 'America/Lima';

    // Progreso temporal (por día con score calculado)
    const [temporalProgress] = await db.query(
      `SELECT 
         TO_CHAR(submission_time AT TIME ZONE $1, 'YYYY-MM-DD') AS month,
         SUM(
           CASE 
             WHEN rating IS NULL OR rating = 0 THEN 1
             WHEN rating >= 800 AND rating <= 900 THEN 1
             WHEN rating = 1000 THEN 2
             WHEN rating = 1100 THEN 3
             WHEN rating >= 1200 THEN 5
             ELSE 0
           END
         ) as count
       FROM submissions
       WHERE user_id = $2
       GROUP BY 1
       ORDER BY month ASC`,
      [tz, userId]
    );

    // Tags más frecuentes
    const [submissions] = await db.query(
      'SELECT tags FROM submissions WHERE user_id = $1',
      [userId]
    );

    const tagCount = {};
    submissions.forEach(sub => {
      let tags = [];
      try {
        if (typeof sub.tags === 'string') {
          tags = JSON.parse(sub.tags);
        } else if (Array.isArray(sub.tags)) {
          tags = sub.tags;
        }
      } catch (err) {
        // Ignorar errores de parsing para tags individuales
        tags = [];
      }
      
      tags.forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });

    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Stats generales
    const [stats] = await db.query(
      `SELECT 
         total_score,
         count_no_rating,
         count_800_900,
         count_1000,
         count_1100,
         count_1200_plus
       FROM user_stats
       WHERE user_id = $1`,
      [userId]
    );

    return {
      generalStats: stats[0] || null,
      ratingDistribution: ratingDist,
      temporalProgress,
      topTags
    };

  } catch (err) {
    console.error('❌ Error obteniendo stats detalladas:', err.message);
    throw err;
  }
}

/**
 * Obtiene estadísticas globales de la plataforma para el contexto del Chatbot
 */
async function getPlatformStats() {
  try {
    // Top 5 Usuarios por Rating
    // Top Usuarios por Rating (Traemos TODOS para contexto completo si son < 50)
    const [allUsers] = await db.query(`
      SELECT u.handle, u.rating, u.rank, us.total_score, us.count_1200_plus
      FROM users u
      LEFT JOIN user_stats us ON u.id = us.user_id
      WHERE u.rating IS NOT NULL
      ORDER BY u.rating DESC
    `);

    // Total de usuarios y submissions
    const [counts] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM submissions) as total_submissions
    `);
    
    // Promedio de rating
    const [avgRating] = await db.query(`SELECT AVG(rating) as avg_rating FROM users WHERE rating > 0`);

    return {
      allUsers,
      totalUsers: counts[0].total_users,
      totalSubmissions: counts[0].total_submissions,
      avgRating: Math.round(avgRating[0].avg_rating || 0)
    };
  } catch (err) {
    console.error('Error getting platform stats:', err);
    return null;
  }
}

/**
 * Obtiene actividad diaria para el heatmap (últimos 365 días)
 * @param {number} userId - ID del usuario
 * @param {number} [days=365] - Días hacia atrás
 * @returns {Promise<Array>} [{ date: 'YYYY-MM-DD', count: number }, ...]
 */
async function getActivityHeatmap(userId, days = 365) {
  try {
    const tz = process.env.TZ || 'America/Lima';

    const [rows] = await db.query(
      `SELECT 
         TO_CHAR(submission_time AT TIME ZONE $1, 'YYYY-MM-DD') AS date,
         SUM(
           CASE 
             WHEN rating IS NULL OR rating = 0 THEN 1
             WHEN rating >= 800 AND rating <= 900 THEN 1
             WHEN rating = 1000 THEN 2
             WHEN rating = 1100 THEN 3
             WHEN rating >= 1200 THEN 5
             ELSE 0
           END
         ) as count
       FROM submissions
       WHERE user_id = $2
         AND submission_time >= CURRENT_TIMESTAMP - ($3 * INTERVAL '1 day')
       GROUP BY 1
       ORDER BY date ASC`,
      [tz, userId, days]
    );

    return rows;
  } catch (err) {
    console.error('❌ Error obteniendo heatmap:', err.message);
    throw err;
  }
}

/**
 * Cantidad de submissions por día en los últimos N días (crudo, sin ponderar por rating).
 * Reutiliza el mismo ajuste de zona horaria que getActivityHeatmap.
 * @param {number} userId - ID del usuario
 * @param {number} [days=7] - Días hacia atrás (inclusive hoy)
 * @returns {Promise<Array>} [{ date: 'YYYY-MM-DD', count: number }, ...] — solo días con submissions
 */
async function getRecentSubmissionCounts(userId, days = 7) {
  try {
    const tz = process.env.TZ || 'America/Lima';

    const [rows] = await db.query(
      `SELECT
         TO_CHAR(submission_time AT TIME ZONE $1, 'YYYY-MM-DD') AS date,
         COUNT(*) as count
       FROM submissions
       WHERE user_id = $2
         AND submission_time >= CURRENT_TIMESTAMP - ($3 * INTERVAL '1 day')
       GROUP BY 1
       ORDER BY date ASC`,
      [tz, userId, days]
    );

    return rows;
  } catch (err) {
    console.error('❌ Error obteniendo submissions recientes:', err.message);
    throw err;
  }
}

module.exports = {
  calculateScore,
  getRatingCategory,
  calculateUserStats,
  getUserDetailedStats,
  getPlatformStats,
  getActivityHeatmap,
  getRecentSubmissionCounts
};
