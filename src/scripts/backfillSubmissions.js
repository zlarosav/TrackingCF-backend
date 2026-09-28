/**
 * Script de backfill: carga todas las submissions desde 2024 para todos los usuarios.
 * 
 * Uso: node src/scripts/backfillSubmissions.js
 * 
 * El script:
 *  1. Itera todos los usuarios habilitados
 *  2. Para cada uno, pide 5000 submissions a la API de Codeforces
 *  3. Filtra solo las aceptadas desde el 1 de enero de 2024
 *  4. Las inserta en la BD (ignorando duplicados)
 *  5. Recalcula estadísticas y rachas
 */

require('dotenv').config();
const { DateTime } = require('luxon');
const db = require('../config/database');

async function main() {
  console.log('🚀 Iniciando backfill de submissions desde 2024...\n');

  // Obtener todos los usuarios habilitados
  const [users] = await db.query('SELECT id, handle, leetcode_handle, atcoder_handle, codechef_handle FROM users WHERE enabled = TRUE');
  console.log(`📋 ${users.length} usuarios habilitados encontrados\n`);

  let totalNew = 0;
  let totalErrors = 0;

  for (const user of users) {
    try {
      console.log(`🔍 Procesando: ${user.handle}...`);

      // 1. Obtener hasta 5000 submissions de Codeforces
      const cfApi = require('../utils/callCodeforcesApi');
      const rawSubmissions = await cfApi('user.status', { handle: user.handle, from: 1, count: 5000 });

      if (!rawSubmissions || rawSubmissions.length === 0) {
        console.log(`⚠️  ${user.handle} - Sin submissions en API`);
        continue;
      }

      // 2. Filtrar: solo OK, desde 2024, sin duplicados locales
      const cutoff = 1704067200; // 1 enero 2024
      const filtered = rawSubmissions.filter(sub => {
        if (sub.verdict !== 'OK') return false;
        if (sub.creationTimeSeconds < cutoff) return false;
        return true;
      });

      if (filtered.length === 0) {
        console.log(`   ${user.handle} - 0 submissions desde 2024`);
        continue;
      }

      console.log(`   ${user.handle} - ${filtered.length} submissions desde 2024`);

      // 3. Formatear para la BD
      const formatted = filtered.map(sub => {
        const time = DateTime.fromSeconds(sub.creationTimeSeconds, { zone: 'utc' }).toUTC().toISO();
        return {
          platform: 'CODEFORCES',
          contest_id: sub.problem.contestId,
          problem_index: sub.problem.index,
          problem_name: sub.problem.name,
          rating: sub.problem.rating || null,
          tags: JSON.stringify(sub.problem.tags || []),
          submission_time: time,
        };
      });

      // 4. Insertar en lote (ignorando duplicados por UNIQUE KEY)
      const Submission = require('../models/Submission');
      const newCount = await Submission.bulkCreate(user.id, formatted);
      totalNew += newCount;

      console.log(`   ✅ ${user.handle} - ${newCount} nuevas submissions guardadas`);

      // 5. Recalcular stats
      const { calculateUserStats } = require('../services/statsService');
      await calculateUserStats(user.id);

      // 6. Actualizar racha
      if (newCount > 0) {
        const latest = formatted[0];
        await db.query(
          `UPDATE users SET last_submission_time = $1 WHERE id = $2`,
          [latest.submission_time, user.id]
        );
        await db.query(
          `UPDATE users SET last_updated = CURRENT_TIMESTAMP WHERE id = $1`,
          [user.id]
        );
      }

      // Pausa para evitar rate limiting
      await new Promise(r => setTimeout(r, 600));

    } catch (err) {
      console.error(`❌ Error con ${user.handle}: ${err.message}`);
      totalErrors++;
    }
  }

  console.log(`\n🎉 Backfill completado:`);
  console.log(`   - Nuevas submissions: ${totalNew}`);
  console.log(`   - Errores: ${totalErrors}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
