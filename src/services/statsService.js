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
      'SELECT rating FROM submissions WHERE user_id = ?',
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
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_score = VALUES(total_score),
         count_no_rating = VALUES(count_no_rating),
         count_800_900 = VALUES(count_800_900),
         count_1000 = VALUES(count_1000),
         count_1100 = VALUES(count_1100),
         count_1200_plus = VALUES(count_1200_plus),
         last_calculated = CURRENT_TIMESTAMP`,
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
      `SELECT 
         CASE 
           WHEN rating IS NULL THEN 'Sin rating'
           WHEN rating >= 800 AND rating <= 900 THEN '800-900'
           WHEN rating = 1000 THEN '1000'
           WHEN rating = 1100 THEN '1100'
           WHEN rating >= 1200 THEN '1200+'
           ELSE 'Otro'
         END as category,
         COUNT(*) as count
       FROM submissions
       WHERE user_id = ?
       GROUP BY category
       ORDER BY FIELD(category, 'Sin rating', '800-900', '1000', '1100', '1200+', 'Otro')`,
      [userId]
    );

    // Obtener offset del timezone configurado
    const { DateTime } = require('luxon');
    const tz = process.env.TZ || 'America/Lima';
    const nowTz = DateTime.now().setZone(tz);
    const offsetMinutes = nowTz.offset; // en minutos, ej: -300 para -05:00
    
    // Crear string de intervalo para MySQL (ej: "-05:00")
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;
    const intervalStr = `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    // Progreso temporal (por día con score calculado)
    // Usamos DATE_ADD/SUB manual porque CONVERT_TZ puede fallar si no hay tablas de timezone
    // DATE_FORMAT para devolver STRING 'YYYY-MM-DD' y evitar problemas de timezone en frontend
    const [temporalProgress] = await db.query(
      `SELECT 
         DATE_FORMAT(DATE_ADD(submission_time, INTERVAL ? HOUR_MINUTE), '%Y-%m-%d') as month,
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
       WHERE user_id = ?
       GROUP BY month
       ORDER BY month ASC`,
      [intervalStr, userId]
    );

    // Tags más frecuentes
    const [submissions] = await db.query(
      'SELECT tags FROM submissions WHERE user_id = ?',
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
       WHERE user_id = ?`,
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

module.exports = {
  calculateScore,
  getRatingCategory,
  calculateUserStats,
  getUserDetailedStats
};
