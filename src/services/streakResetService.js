const { DateTime } = require('luxon');
const db = require('../config/database');
const codeforcesService = require('./codeforcesService');
const normalizeCodeforcesAvatarUrl = require('../utils/normalizeCodeforcesAvatarUrl');

/**
 * Reset streaks for users who didn't submit yesterday
 * Runs daily at 00:00 Lima time
 */
async function resetExpiredStreaks() {
  try {
    const tz = process.env.TZ || 'America/Lima';
    const now = DateTime.now().setZone(tz);
    
    console.log(`\n🔄 Verificando rachas expiradas [${now.toFormat('dd/MM/yyyy HH:mm')} ${tz}]`);
    
    // Get all users with active streaks
    const [users] = await db.query(
      'SELECT id, handle, current_streak, last_streak_date FROM users WHERE current_streak > 0'
    );
    
    if (users.length === 0) {
      console.log('📊 No hay usuarios con rachas activas');
      return;
    }
    
    console.log(`📊 Verificando ${users.length} usuarios con rachas activas...`);
    
    const today = now.startOf('day');
    let resetsCount = 0;
    
    for (const user of users) {
      if (!user.last_streak_date) {
        // Shouldn't happen, but handle it
        await db.query(
          'UPDATE users SET current_streak = 0, last_streak_date = NULL WHERE id = $1',
          [user.id]
        );
        console.log(`⚠️  ${user.handle}: racha reseteada (sin last_streak_date)`);
        resetsCount++;
        continue;
      }
      
      // Convert last_streak_date to String YYYY-MM-DD (Lima)
      let lastDateStr;
      if (user.last_streak_date instanceof Date) {
          // If legacy Date object, convert to Lima
          lastDateStr = DateTime.fromJSDate(user.last_streak_date, { zone: 'utc' }).setZone(tz).toISODate();
      } else {
          // If string, assume YYYY-MM-DD
          lastDateStr = String(user.last_streak_date).substring(0, 10);
      }
      
      const lastStreakDate = DateTime.fromISO(lastDateStr, { zone: tz }).startOf('day');
      
      // Calculate days difference
      const daysSince = Math.floor(today.diff(lastStreakDate, 'days').days);
      
      // If more than 1 day has passed since last streak date, reset
      if (daysSince > 1) {
        await db.query(
          'UPDATE users SET current_streak = 0, last_streak_date = NULL WHERE id = $1',
          [user.id]
        );
        console.log(`❌ ${user.handle}: racha ${user.current_streak} → 0 (${daysSince} días sin activity)`);
        resetsCount++;
      }
    }
    
    if (resetsCount === 0) {
      console.log('✅ Todas las rachas siguen activas');
    } else {
      console.log(`\n✅ ${resetsCount} racha(s) reseteada(s)\n`);
    }
    
  } catch (err) {
    console.error('❌ Error reseteando rachas:', err.message);
  }
}

/**
 * Update avatars for all enabled users from Codeforces
 * Checks if avatar has changed and updates if necessary
 */
async function updateUserAvatars() {
  try {
    const tz = process.env.TZ || 'America/Lima';
    const now = DateTime.now().setZone(tz);
    
    console.log(`\n🖼️  Actualizando avatares de usuarios [${now.toFormat('dd/MM/yyyy HH:mm')} ${tz}]`);
    
    // Get all enabled users
    const [users] = await db.query(
      'SELECT id, handle, avatar_url FROM users WHERE enabled = TRUE'
    );
    
    if (users.length === 0) {
      console.log('📊 No hay usuarios habilitados');
      return;
    }
    
    console.log(`📊 Verificando avatares de ${users.length} usuarios...`);
    
    let updatedCount = 0;
    
    for (const user of users) {
      try {
        // Get user info from Codeforces
        const userInfo = await codeforcesService.getUserInfo(user.handle);
        const newAvatarUrl = normalizeCodeforcesAvatarUrl(userInfo.avatar || userInfo.titlePhoto || null);
        
        // Check if avatar changed
        if (newAvatarUrl && newAvatarUrl !== user.avatar_url) {
          await db.query(
            'UPDATE users SET avatar_url = $1 WHERE id = $2',
            [newAvatarUrl, user.id]
          );
          console.log(`✅ ${user.handle}: avatar actualizado`);
          updatedCount++;
        }
      } catch (err) {
        // If user not found, skip (will be handled by streak reset)
        if (err.response?.status === 404 || err.message?.includes('not found')) {
          console.log(`⚠️  ${user.handle}: usuario no encontrado (se inhabilitará en reset de rachas)`);
        } else {
          console.log(`⚠️  ${user.handle}: error obteniendo info - ${err.message}`);
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (updatedCount === 0) {
      console.log('✅ No hay avatares por actualizar');
    } else {
      console.log(`\n✅ ${updatedCount} avatar(es) actualizado(s)\n`);
    }
    
  } catch (err) {
    console.error('❌ Error actualizando avatares:', err.message);
  }
}

module.exports = { resetExpiredStreaks, updateUserAvatars };
