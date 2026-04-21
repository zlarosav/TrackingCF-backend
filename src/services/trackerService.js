const { DateTime } = require('luxon');
const codeforcesService = require('./codeforcesService');
const { getUserSubmissions } = codeforcesService;
const User = require('../models/User');
const Submission = require('../models/Submission');
const { calculateUserStats } = require('./statsService');
const db = require('../config/database');
const { normalizeAcceptedSubmissions } = require('./atcoderService');

const FEATURE_ATCODER_SUBMISSIONS = 'feature_atcoder_submissions';

async function isFeatureEnabled(key, fallback = false) {
  try {
    const [rows] = await db.query('SELECT value FROM system_metadata WHERE key_name = ? LIMIT 1', [key]);
    if (!rows.length) return fallback;
    const value = String(rows[0].value || '').trim().toLowerCase();
    return value === '1' || value === 'true' || value === 'on' || value === 'enabled';
  } catch (err) {
    console.error(`⚠️  Error leyendo feature flag ${key}:`, err.message);
    return fallback;
  }
}

/**
 * Filtra submissions válidas (OK, fecha válida, sin duplicados)
 * @param {Array} submissions - Array de submissions de la API
 * @returns {Array} Submissions filtradas
 */
function filterValidSubmissions(submissions) {
  const seen = new Set();
  const cutoffTimestamp = 1735689600; // 1 de enero de 2026 00:00 UTC

  return submissions.filter(sub => {
    // Solo aceptar veredicto OK
    if (sub.verdict !== 'OK') return false;

    // Filtrar por fecha (solo submissions desde el cutoff)
    if (sub.creationTimeSeconds < cutoffTimestamp) return false;

    // Evitar duplicados por problema
    const key = `${sub.problem.contestId}${sub.problem.index}`;
    if (seen.has(key)) return false;
    
    seen.add(key);
    return true;
  });
}

/**
 * Convierte una submission de la API al formato de BD
 * @param {Object} sub - Submission de la API
 * @returns {Object} Submission formateada
 */
function formatSubmission(sub) {
  // Codeforces devuelve timestamps en UTC (Unix timestamp)
  // Guardar directamente en UTC sin conversión
  // Formatear para MySQL (YYYY-MM-DD HH:MM:SS)
  const submissionTime = DateTime.fromSeconds(sub.creationTimeSeconds, { zone: 'utc' })
    .toFormat('yyyy-MM-dd HH:mm:ss');

  return {
    platform: 'CODEFORCES',
    contestId: sub.problem.contestId,
    problemIndex: sub.problem.index,
    problemName: sub.problem.name,
    rating: sub.problem.rating || null,
    tags: sub.problem.tags || [],
    submissionTime
  };
}

/**
 * Trackea y actualiza las submissions de un usuario
 * @param {string} handle - Handle del usuario en Codeforces
 * @returns {Promise<Object>} Resultado del tracking
 */
async function trackUser(handle) {
  try {
    console.log(`🔍 Trackeando usuario: ${handle}`);

    // Verificar que el usuario exista en la BD
    const user = await User.findByHandle(handle);
    if (!user) {
      throw new Error(`Usuario ${handle} no encontrado en la base de datos`);
    }

    // Obtener información actualizada del usuario
    try {
      const userInfo = await codeforcesService.getUserInfo(handle);
      
      await User.updateUserInfo(user.id, {
        avatarUrl: userInfo.avatar || userInfo.titlePhoto || null,
        rating: userInfo.rating || null,
        rank: userInfo.rank || null,
        lastSubmissionTime: user.last_submission_time
      });

      // Detect Rank Change
      if (user.rank && userInfo.rank && user.rank !== userInfo.rank) {
          const { createNotification } = require('./notificationService');
          if (userInfo.rating > user.rating) {
               await createNotification(
                   'RANK_UP',
                   `🚀 ${handle} ha alcanzado un nuevo rango: ${userInfo.rank}!`,
                   handle
               );
          }
      }
    } catch (err) {
      // Nunca deshabilitar usuarios automáticamente por errores externos de la API.
      // Continuamos el tracking para que el sistema se recupere solo en el siguiente ciclo.
      console.log(`⚠️  ${handle} - No se pudo actualizar perfil de Codeforces: ${err.message}`);
    }

    // Obtener la última submission guardada
    const lastSubmissionTime = await User.getLastSubmissionTime(user.id);
    
    // Consultar solo submissions recientes (optimización)
    // Para usuarios nuevos: obtener 500 submissions
    // Para usuarios existentes: solo las últimas 100
    const count = lastSubmissionTime ? 100 : 500;
    const submissions = await getUserSubmissions(handle, count);
    
    if (!submissions || submissions.length === 0) {
      console.log(`⚠️  ${handle} - No hay submissions en la API`);
      return { handle, newSubmissions: 0, error: null };
    }

    // Filtrar submissions válidas
    const validSubmissions = filterValidSubmissions(submissions);
    console.log(`📊 ${handle} - ${validSubmissions.length} submissions válidas encontradas`);

    if (validSubmissions.length === 0) {
      return { handle, newSubmissions: 0, error: null };
    }

    // Formatear submissions para la BD
    const formattedSubmissions = validSubmissions.map(formatSubmission);

    // Insertar en la BD (ignorar duplicados)
    const newCount = await Submission.bulkCreate(user.id, formattedSubmissions);

    // Actualizar el timestamp de la última submission si hay nuevas
    if (newCount > 0 && formattedSubmissions.length > 0) {
      const latestSubmission = formattedSubmissions[0]; // Ya están ordenadas por fecha
      
      await User.updateUserInfo(user.id, {
        avatarUrl: user.avatar_url,
        rating: user.rating,
        rank: user.rank,
        lastSubmissionTime: latestSubmission.submissionTime
      });
    }

    // Optional AtCoder tracking behind feature flag to protect Codeforces flow.
    if (await isFeatureEnabled(FEATURE_ATCODER_SUBMISSIONS, false)) {
      const atcoderHandle = user.atcoder_handle;
      if (atcoderHandle) {
        try {
          const lastAtcoder = await Submission.getLastSubmissionTimeByPlatform(user.id, 'ATCODER');
          const fromSecond = lastAtcoder ? Math.floor(new Date(lastAtcoder).getTime() / 1000) : 1735689600;

          const atcoderSubmissions = await normalizeAcceptedSubmissions(atcoderHandle, fromSecond);
          const atcoderNew = await Submission.bulkCreate(user.id, atcoderSubmissions);
          if (atcoderNew > 0) {
            console.log(`✅ ${handle} (${atcoderHandle}) - ${atcoderNew} nuevas submissions ATCODER`);
          }
        } catch (atErr) {
          console.error(`⚠️  Error trackeando AtCoder para ${handle}:`, atErr.message);
        }
      }
    }

    // Recalcular estadísticas del usuario
    await calculateUserStats(user.id);

    // Actualizar racha del usuario si hay nuevas submissions
    if (newCount > 0 && formattedSubmissions.length > 0) {
      const latestSubmission = formattedSubmissions[0]; // Ya están ordenadas por fecha
      await User.updateStreakOnNewSubmission(user.id, latestSubmission.submissionTime);
    }

    // Actualizar timestamp de última actualización
    await User.updateLastUpdated(user.id);

    console.log(`✅ ${handle} - ${newCount} nuevas submissions agregadas`);

    return {
      handle,
      newSubmissions: newCount,
      error: null
    };

  } catch (err) {
    console.error(`❌ Error trackeando ${handle}:`, err.message);
    return {
      handle,
      newSubmissions: 0,
      error: err.message
    };
  }
}

/**
 * Trackea todos los usuarios en la base de datos
 * @returns {Promise<Array>} Resultados del tracking
 */
async function trackAllUsers() {
  try {
    const users = await User.findAll();
    
    if (users.length === 0) {
      console.log('⚠️  No hay usuarios para trackear');
      return [];
    }

    console.log(`🚀 Iniciando tracking de ${users.length} usuarios`);

    const results = [];
    
    // Trackear cada usuario secuencialmente (evitar rate limiting)
    for (const user of users) {
      const result = await trackUser(user.handle);
      results.push(result);
      
      // Pequeña pausa entre usuarios (500ms)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const totalNew = results.reduce((sum, r) => sum + r.newSubmissions, 0);
    const errors = results.filter(r => r.error).length;

    console.log(`🎉 Tracking completado: ${totalNew} nuevas submissions, ${errors} errores`);

    // Actualizar timestamp de ejecución global
    await updateLastTrackerRun();

    return results;

  } catch (err) {
    console.error('❌ Error en trackAllUsers:', err.message);
    throw err;
  }
}

/**
 * Actualiza la fecha de última ejecución del tracker en la metadata
 */
async function updateLastTrackerRun() {
  try {
    // Guardar timestamp UTC actual
    const now = DateTime.now().toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
    
    await db.query(
      `INSERT INTO system_metadata (key_name, value, updated_at)
       VALUES ('last_tracker_run', ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
      [now, now]
    );
  } catch (err) {
    console.error('⚠️  No se pudo actualizar metadata:', err.message);
  }
}

module.exports = {
  trackUser,
  trackAllUsers,
  filterValidSubmissions,
  formatSubmission
};
