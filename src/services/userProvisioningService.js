const db = require('../config/database');
const User = require('../models/User');
const { getUserInfo, getEnrichedRatingHistory } = require('./codeforcesService');
const { trackUser } = require('./trackerService');
const normalizeCodeforcesAvatarUrl = require('../utils/normalizeCodeforcesAvatarUrl');

class UserProvisioningError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'UserProvisioningError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeLogger(logger) {
  if (!logger) {
    return {
      info: () => {},
      warn: () => {},
    };
  }

  return {
    info: typeof logger.info === 'function' ? logger.info.bind(logger) : () => {},
    warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : () => {},
  };
}

function isTemporaryCodeforcesError(error) {
  const message = String(error?.message || '');
  return ['502', '503', '504'].some((code) => message.includes(code));
}

async function createTrackedUser({
  handle,
  leetcodeHandle,
  atcoderHandle,
  codechefHandle,
  logger,
} = {}) {
  const log = normalizeLogger(logger);
  const cleanHandle = String(handle || '').trim();
  const platformHandles = {
    leetcodeHandle: String(leetcodeHandle || '').trim() || null,
    atcoderHandle: String(atcoderHandle || '').trim() || null,
    codechefHandle: String(codechefHandle || '').trim() || null,
  };

  if (!cleanHandle) {
    throw new UserProvisioningError('Handle requerido', 'HANDLE_REQUIRED');
  }

  const existing = await User.findByHandle(cleanHandle);
  if (existing) {
    throw new UserProvisioningError(`El usuario '${cleanHandle}' ya existe`, 'USER_EXISTS', 400);
  }

  log.info(`Verificando usuario en Codeforces: ${cleanHandle}`);

  let userInfo;
  try {
    userInfo = await getUserInfo(cleanHandle);
  } catch (error) {
    throw new UserProvisioningError(
      `Usuario '${cleanHandle}' no encontrado en Codeforces`,
      'CODEFORCES_USER_NOT_FOUND',
      404
    );
  }

  log.info(`Usuario encontrado en Codeforces: ${userInfo.handle}`);

  let userId;
  const warnings = [];

  try {
    userId = await User.create(cleanHandle, platformHandles);
    log.info(`Usuario '${cleanHandle}' creado con ID: ${userId}`);

    const avatarUrl = normalizeCodeforcesAvatarUrl(userInfo.avatar || userInfo.titlePhoto || null);
    await User.updateUserInfo(userId, {
      avatarUrl,
      rating: userInfo.rating || null,
      rank: userInfo.rank || null,
      lastSubmissionTime: null,
    });

    await db.query('INSERT INTO user_stats (user_id) VALUES ($1)', [userId]);
    await User.updatePlatformHandles(userId, platformHandles);

    try {
      log.info('Obteniendo historial de contests...');
      const history = await getEnrichedRatingHistory(cleanHandle);
      await User.updateRatingHistory(userId, history);
      log.info(`Historial de contests guardado (${history.length} eventos)`);
    } catch (error) {
      const warning = `No se pudo obtener historial de ratings: ${error.message}`;
      warnings.push(warning);
      log.warn(warning);
    }

    log.info('Obteniendo submissions y calculando estadísticas...');
    const trackResult = await trackUser(cleanHandle);

    const streakResult = await User.intelligentStreakCalculation(userId);
    if (streakResult.streak > 0) {
      await db.query(
        'UPDATE users SET current_streak = $1, last_streak_date = $2 WHERE id = $3',
        [streakResult.streak, streakResult.lastDate, userId]
      );
    }

    return {
      userId,
      handle: cleanHandle,
      leetcodeHandle: platformHandles.leetcodeHandle,
      atcoderHandle: platformHandles.atcoderHandle,
      codechefHandle: platformHandles.codechefHandle,
      avatarUrl,
      rating: userInfo.rating || null,
      rank: userInfo.rank || null,
      newSubmissions: trackResult?.newSubmissions || 0,
      trackError: trackResult?.error || null,
      streak: streakResult.streak,
      warnings,
    };
  } catch (error) {
    if (userId && isTemporaryCodeforcesError(error)) {
      log.warn(`Eliminando usuario '${cleanHandle}' creado parcialmente por error temporal de Codeforces.`);
      await User.delete(cleanHandle);
    }

    throw error;
  }
}

module.exports = {
  UserProvisioningError,
  createTrackedUser,
};
