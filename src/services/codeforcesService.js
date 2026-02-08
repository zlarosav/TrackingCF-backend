const callCodeforcesApi = require('../utils/callCodeforcesApi');
const db = require('../config/database');

/**
 * Obtiene las submissions de un usuario
 * @param {string} handle - Handle del usuario
 * @param {number} count - Cantidad de submissions a obtener
 * @returns {Promise<Array>} Array de submissions
 */
async function getUserSubmissions(handle, count = 500) {
  return await callCodeforcesApi('user.status', {
    handle,
    from: 1,
    count
  });
}

/**
 * Obtiene información de un usuario
 * @param {string} handle - Handle del usuario
 * @returns {Promise<Object>} Información del usuario
 */
async function getUserInfo(handle) {
  const result = await callCodeforcesApi('user.info', { handles: handle });
  return result[0];
}

/**
 * Obtiene el historial de rating de un usuario
 * @param {string} handle - Handle del usuario
 * @returns {Promise<Array>} Historial de rating
 */
async function getUserRatingHistory(handle) {
  return await callCodeforcesApi('user.rating', { handle });
}

/**
 * Obtiene historial de rating enriquecido con detalles de problemas y veredictos
 * Utiliza caché de base de datos para los problemas del contest, llenando los faltantes on-demand.
 * @param {string} handle 
 * @returns {Promise<Array>} Rich history object
 */
async function getEnrichedRatingHistory(handle) {
  try {
      // 1. Fetch History & Submissions in parallel
      const [ratingHistory, submissions] = await Promise.all([
          callCodeforcesApi('user.rating', { handle }),
          callCodeforcesApi('user.status', { handle, count: 5000 })
      ]);

      if (!ratingHistory || !ratingHistory.length) return [];

      // 2. Identify all Contest IDs
      const contestIds = [...new Set(ratingHistory.map(r => r.contestId))];

      // 3. Check DB for cached problems
      const contestProblemsMap = {};
      
      // Helper to chunk array
      const chunkArray = (arr, size) => 
          Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
              arr.slice(i * size, i * size + size)
          );

      const chunks = chunkArray(contestIds, 50); // Query 50 at a time
      
      for (const chunk of chunks) {
          if (!chunk.length) continue;
          const placeholders = chunk.map(() => '?').join(',');
          const [rows] = await db.query(
              `SELECT id, problems FROM contests WHERE id IN (${placeholders})`,
              chunk
          );
          rows.forEach(row => {
              if (row.problems) {
                  contestProblemsMap[row.id] = typeof row.problems === 'string' ? JSON.parse(row.problems) : row.problems;
              }
          });
      }

      // 4. Identify Missing Contests
      const missingIds = contestIds.filter(id => !contestProblemsMap[id]);
      
      if (missingIds.length > 0) {
          console.log(`⚠️ Missing problem cache for ${missingIds.length} contests. Fetching from Codeforces...`);
          
          // Fetch sequentially with delay to avoid rate limits
          for (const id of missingIds) {
              try {
                  // Fetch Standings (minimal) to get Problems
                  // Optimization: No 'showUnofficial' (faster), rely on callCodeforcesApi retries
                  const standings = await callCodeforcesApi('contest.standings', { 
                      contestId: id, 
                      from: 1, 
                      count: 1
                  });
                  
                  const problems = standings.problems || [];
                  contestProblemsMap[id] = problems;

                  // Update DB
                  const contestInfo = ratingHistory.find(r => r.contestId === id);
                  const name = contestInfo ? contestInfo.contestName : `Contest ${id}`;
                  const startTime = contestInfo ? contestInfo.ratingUpdateTimeSeconds : 0; 

                  const query = `
                      INSERT INTO contests (id, name, startTimeSeconds, problems, platform, created_at)
                      VALUES (?, ?, ?, ?, 'CODEFORCES', NOW())
                      ON DUPLICATE KEY UPDATE 
                          problems = VALUES(problems),
                          updated_at = NOW()
                  `;

                  await db.query(query, [id, name, startTime, JSON.stringify(problems)]);
                  
                  console.log(`   ✅ Cached problems for Contest ${id}`);
                  
                  // Rate limit delay (reduced to 200ms since we have retries now)
                  await new Promise(r => setTimeout(r, 200)); 

              } catch (err) {
                  console.error(`   ❌ Failed to cache Contest ${id}: ${err.message}`);
                  contestProblemsMap[id] = [];
              }
          }
      }

      // 5. Build Rich History
      const richHistory = ratingHistory.map(contest => {
          const globalProblems = contestProblemsMap[contest.contestId] || [];
          const contestSubs = submissions.filter(s => s.contestId === contest.contestId);
          
          const userStatusMap = {};
          contestSubs.forEach(sub => {
              const idx = sub.problem.index;
              const current = userStatusMap[idx];
              const isOK = sub.verdict === 'OK';
              
              if (!current || (isOK && current.verdict !== 'OK')) {
                  userStatusMap[idx] = {
                      verdict: sub.verdict,
                      timeConsumedMillis: sub.timeConsumedMillis
                  };
              }
          });

          const problems = globalProblems.map(p => {
              const status = userStatusMap[p.index];
              return {
                  index: p.index,
                  name: p.name,
                  rating: p.rating,
                  tags: p.tags,
                  verdict: status ? status.verdict : null,
                  attempted: !!status
              };
          });
          
          problems.sort((a, b) => {
               const idxA = a.index;
               const idxB = b.index;
               if (idxA.length !== idxB.length) return idxA.length - idxB.length;
               return idxA.localeCompare(idxB);
          });

          return {
              ...contest,
              problems: problems
          };
      });

      return richHistory;

  } catch (error) {
      console.error(`Error enriching history for ${handle}:`, error.message);
      throw error;
  }
}

module.exports = {
  callCodeforcesApi,
  getUserSubmissions,
  getUserInfo,
  getUserRatingHistory,
  getEnrichedRatingHistory
};
