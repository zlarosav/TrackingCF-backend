const { DateTime } = require('luxon');
const { getUserSubmissions } = require('./codeforcesService');
const User = require('../models/User');
const Submission = require('../models/Submission');
const { calculateUserStats } = require('./statsService');

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
  const submissionTime = DateTime.fromSeconds(sub.creationTimeSeconds)
    .setZone('America/Lima')
    .toISO();

  return {
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

    // Obtener info del usuario desde Codeforces (avatar, rating, etc)
    try {
      const { getUserInfo } = require('./codeforcesService');
      const userInfo = await getUserInfo(handle);
      
      await User.updateUserInfo(user.id, {
        avatarUrl: userInfo.avatar || userInfo.titlePhoto || null,
        rating: userInfo.rating || null,
        rank: userInfo.rank || null,
        lastSubmissionTime: user.last_submission_time
      });
    } catch (err) {
      console.log(`⚠️  No se pudo obtener info de usuario de ${handle}`);
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

    // Recalcular estadísticas del usuario
    await calculateUserStats(user.id);

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

    return results;

  } catch (err) {
    console.error('❌ Error en trackAllUsers:', err.message);
    throw err;
  }
}

module.exports = {
  trackUser,
  trackAllUsers,
  filterValidSubmissions,
  formatSubmission
};
