require('dotenv').config();
const User = require('../models/User');
const { getUserInfo } = require('../services/codeforcesService');
const db = require('../config/database');

async function createUser() {
  try {
    const handle = process.argv[2];

    if (!handle) {
      console.error('❌ Error: Debes proporcionar un handle');
      console.log('Uso: npm run user:create <handle>');
      console.log('Ejemplo: npm run user:create zlarosav');
      process.exit(1);
    }

    console.log(`🔍 Verificando usuario en Codeforces: ${handle}`);

    // Verificar que el usuario existe en Codeforces y obtener su información
    let userInfo;
    try {
      userInfo = await getUserInfo(handle);
      console.log(`✅ Usuario encontrado en Codeforces: ${userInfo.handle}`);
      if (userInfo.rating) {
        console.log(`   Rating: ${userInfo.rating} (${userInfo.rank})`);
      }
    } catch (err) {
      console.error(`❌ Usuario '${handle}' no encontrado en Codeforces`);
      console.error(`   Error: ${err.message}`);
      process.exit(1);
    }

    // Verificar si ya existe en la BD
    const existing = await User.findByHandle(handle);
    if (existing) {
      console.error(`❌ El usuario '${handle}' ya existe en la base de datos`);
      process.exit(1);
    }

    // Crear usuario
    const userId = await User.create(handle);
    console.log(`✅ Usuario '${handle}' creado con ID: ${userId}`);

    // Actualizar con información de Codeforces
    const avatarUrl = userInfo.avatar || userInfo.titlePhoto || null;
    if (avatarUrl) {
      // Convertir URL relativa a absoluta si es necesario
      const fullAvatarUrl = avatarUrl.startsWith('//') 
        ? `https:${avatarUrl}` 
        : avatarUrl.startsWith('/') 
        ? `https://codeforces.com${avatarUrl}` 
        : avatarUrl;
      
      await User.updateUserInfo(userId, {
        avatarUrl: fullAvatarUrl,
        rating: userInfo.rating || null,
        rank: userInfo.rank || null,
        lastSubmissionTime: null
      });
      
      console.log(`✅ Avatar guardado: ${fullAvatarUrl}`);
      if (userInfo.rating) {
        console.log(`✅ Rating y rank actualizados`);
      }
    } else {
      console.log(`⚠️  No se encontró avatar para este usuario`);
    }

    // Crear entrada en user_stats
    await db.query(
      `INSERT INTO user_stats (user_id) VALUES (?)`,
      [userId]
    );

    console.log(`✅ Estadísticas inicializadas para '${handle}'`);
    console.log(`\n📊 Obteniendo submissions desde el 1 de enero de 2026...`);
    
    // Trackear automáticamente el usuario recién creado
    const { trackUser } = require('../services/trackerService');
    let result;
    
    try {
      result = await trackUser(handle);
    } catch (trackError) {
      // Si hay error de API (como 502), eliminar el usuario y abortar
      console.error(`\n❌ Error al trackear usuario: ${trackError.message}`);
      
      if (trackError.message.includes('502') || trackError.message.includes('503') || trackError.message.includes('504')) {
        console.log(`\n🗑️  Eliminando usuario parcialmente creado...`);
        await User.delete(handle);
        console.log(`✅ Usuario '${handle}' eliminado`);
        console.log(`\n⚠️  La API de Codeforces está teniendo problemas temporales.`);
        console.log(`💡 Por favor intenta crear el usuario nuevamente en unos minutos.`);
        process.exit(1);
      }
      
      throw trackError;
    }
    
    if (result.error) {
      console.error(`⚠️  Error al obtener submissions: ${result.error}`);
    } else {
      console.log(`✅ ${result.newSubmissions} submissions obtenidas y guardadas`);
      
      // Calculate intelligent streak from historical data
      console.log(`\n📊 Calculando racha desde historial...`);
      const streakResult = await User.intelligentStreakCalculation(userId);
      
      if (streakResult.streak > 0) {
        await db.query(
          'UPDATE users SET current_streak = ?, last_streak_date = ? WHERE id = ?',
          [streakResult.streak, streakResult.lastDate, userId]
        );
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lastDate = new Date(streakResult.lastDate);
        lastDate.setHours(0, 0, 0, 0);
        const daysSinceLastSub = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
        
        if (daysSinceLastSub === 0) {
          console.log(`✅ Racha activa: 🔥${streakResult.streak} días consecutivos`);
        } else if (daysSinceLastSub === 1) {
          console.log(`✅ Racha de ${streakResult.streak} días (última submission ayer)`);
        }
      } else {
        console.log(`📊 Sin racha activa`);
      }
    }
    
    console.log(`\n🎉 Usuario '${handle}' creado y trackeado exitosamente`);

    process.exit(0);

  } catch (err) {
    console.error('❌ Error creando usuario:', err.message);
    process.exit(1);
  }
}

createUser();
