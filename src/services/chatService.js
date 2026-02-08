const db = require('../config/database');
const geminiService = require('./geminiService');
const statsService = require('./statsService'); // To get context

// Simple in-memory rate limiter: Map<IP_Handle, Timestamp[]>
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute

function checkRateLimit(key) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  
  // Filter out old timestamps
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  
  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  validTimestamps.push(now);
  rateLimitMap.set(key, validTimestamps);
  return true;
}

/**
 * Builds the system prompt with user context
 * @param {string} handle 
 */
async function buildSystemPrompt(handle) {
  try {
    // Fetch stats
    const [userRows] = await db.query('SELECT * FROM users WHERE handle = ?', [handle]);
    const user = userRows[0];
    
    if (!user) return "Eres un asistente de programación competitiva. El usuario no existe en nuestra base de datos.";
    
    const detailedStats = await statsService.getUserDetailedStats(user.id);
    
    let statsSummary = `
      Usuario: ${user.handle}
      Rating Actual: ${user.rating || 'N/A'} (Rank: ${user.rank || 'N/A'})
      Racha Actual: ${user.current_streak} días
      Score Total: ${detailedStats.generalStats?.total_score || 0}
      Problemas Resueltos:
      - Sin Rating: ${detailedStats.generalStats?.count_no_rating || 0}
      - 800-900: ${detailedStats.generalStats?.count_800_900 || 0}
      - 1000: ${detailedStats.generalStats?.count_1000 || 0}
      - 1100: ${detailedStats.generalStats?.count_1100 || 0}
      - 1200+: ${detailedStats.generalStats?.count_1200_plus || 0}
      Top Tags: ${detailedStats.topTags.map(t => `${t.tag} (${t.count})`).join(', ')}
    `;

    // Fetch Global Stats
    const globalStats = await statsService.getPlatformStats();
    let globalContext = '';
    if (globalStats) {
        globalContext = `
        Contexto Global de la Plataforma (TrackingCF):
        - Total Usuarios: ${globalStats.totalUsers}
        - Total Envíos: ${globalStats.totalSubmissions}
        - Rating Promedio: ${globalStats.avgRating}
        
        LISTA COMPLETA DE USUARIOS (Ordenados por Rating):
        | Handle | Rating | Rank | Score Total | Problemas 1200+ |
        |---|---|---|---|---|
        ${globalStats.allUsers.map(u => `| ${u.handle} | ${u.rating} | ${u.rank} | ${u.total_score || 0} | ${u.count_1200_plus || 0} |`).join('\n        ')}
        `;
    }

    return ` 
      Actúa como el asistente oficial de TrackingCF, un coach experto en Programación Competitiva.
      
      CONTEXTO DE LA PLATAFORMA (TrackingCF):
      - Creador: zlarosav
      - Tecnologías: Next.js, Node.js, MySQL, TailwindCSS, Codeforces API, Gemini AI.
      - Lógica de Puntos (Score):
        * Sin rating / 800-900: +1 punto
        * 1000: +2 puntos
        * 1100: +3 puntos
        * 1200+: +5 puntos
      
      ${globalContext}

      ESTÁS ANALIZANDO EL PERFIL DE: ${handle}
      Aquí están sus estadísticas actuales:
      ${statsSummary}
      
      INSTRUCCIONES CLAVE DE PERSONALIDAD:
      1. TERCERA PERSONA: El usuario con el que chateas NO NECESARIAMENTE es ${handle}. 
         - Refiérete a ${handle} como "él", "ella", "el usuario" o por su handle.
         - Ejemplo: "Veo que ${handle} tiene un buen rating" en lugar de "Tienes un buen rating".
         - SOLO si el usuario explícitamente dice "soy yo", puedes tratarlo de tú, pero por defecto asume que es un observador.
      
      2. ANALISTA EXPERTO:
         - Responde con datos duros basándote en la tabla de usuarios y las stats provistas.
         - Comparaciones: Usa la lista global para situar a ${handle} en el ranking (ej: "Está en el rank X de Y usuarios").
      
      3. FUNCIONALIDAD:
         - Si te preguntan "quién es el mejor", busca en la tabla global.
         - Si te preguntan "cómo mejorar", analiza las debilidades de ${handle} (ej: pocos problemas de 1200+) y da consejos.
      
       4. GENERAL:
          - Sé motivador pero realista y profesional.
          - Mantén las respuestas concisas.

       5. FORMATO DE RESPUESTA:
          - Usa Markdown para estructurar tu respuesta.
          - Usa listas (bullet points) para enumerar datos o consejos.
          - Usa **negritas** para resaltar palabras clave o números importantes.
          - Si das código, usa bloques de código.
          - Puedes usar emojis para hacer la respuesta más amigable.
          - Mantén párrafos cortos y legibles.
    `;
  } catch (error) {
    console.error('Error building system prompt:', error);
    return "Eres un asistente de programación competitiva.";
  }
}

/**
 * Process a chat message
 */
async function processMessage(sessionId, handle, userMessage, clientIp) {
  // Rate Limit Check
  const rateKey = `${clientIp}_${sessionId}`;
  if (!checkRateLimit(rateKey)) {
    throw new Error('Too many requests. Please wait a moment.');
  }

  // 1. Save User Message
  await db.query(`
    INSERT INTO chat_messages (session_id, user_handle, role, message)
    VALUES (?, ?, 'user', ?)
  `, [sessionId, handle, userMessage]);

  // 2. Load History (Last 20 messages for context)
  const [rows] = await db.query(`
    SELECT role, message FROM chat_messages 
    WHERE session_id = ? 
    ORDER BY timestamp ASC 
    LIMIT 20
  `, [sessionId]);

  // Format for Gemini
  const history = rows.map(r => ({
    role: r.role === 'user' ? 'user' : 'model',
    parts: [{ text: r.message }]
  }));

  // 3. Build System Prompt & Call Gemini
  let aiResponseText;
  try {
      const systemPrompt = await buildSystemPrompt(handle);
      aiResponseText = await geminiService.generateContent(history, systemPrompt);
  } catch (error) {
      console.error('Error in chat generation:', error);
      aiResponseText = "Lo siento, hubo un problema técnico con el servicio de IA. Por favor intenta más tarde.";
  }

  // 4. Save AI Response
  await db.query(`
    INSERT INTO chat_messages (session_id, user_handle, role, message)
    VALUES (?, ?, 'model', ?)
  `, [sessionId, handle, aiResponseText]);

  return aiResponseText;
}

async function getHistory(sessionId) {
  const [rows] = await db.query(`
    SELECT role, message, timestamp FROM chat_messages 
    WHERE session_id = ? 
    ORDER BY timestamp ASC
  `, [sessionId]);
  
  return rows;
}

async function clearHistory(sessionId) {
  await db.query(`DELETE FROM chat_messages WHERE session_id = ?`, [sessionId]);
  return true;
}

module.exports = {
  processMessage,
  getHistory,
  clearHistory
};
