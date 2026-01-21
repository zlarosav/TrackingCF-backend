const crypto = require('crypto');
const axios = require('axios');
const config = require('../config/codeforces');

/**
 * Llama a la API de Codeforces con firma de seguridad
 * @param {string} methodName - Nombre del método de la API
 * @param {Object} params - Parámetros de la llamada
 * @returns {Promise<any>} Resultado de la API
 */
async function callCodeforcesApi(methodName, params = {}) {
  const { apiKey, apiSecret } = config;

  if (!apiKey || !apiSecret) {
    throw new Error('API_KEY_CF y API_SECRET_CF deben estar configurados');
  }

  const time = Math.floor(Date.now() / 1000);
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');

  // Agregar parámetros obligatorios
  const fullParams = {
    ...params,
    apiKey,
    time,
  };

  // Ordenar alfabéticamente por clave y luego valor
  const sortedParams = Object.entries(fullParams)
    .sort(([k1, v1], [k2, v2]) => k1.localeCompare(k2) || String(v1).localeCompare(String(v2)))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  // Construir la string a hashear
  const stringToHash = `${rand}/${methodName}?${sortedParams}#${apiSecret}`;

  const hash = crypto.createHash('sha512').update(stringToHash).digest('hex');
  const apiSig = `${rand}${hash}`;

  const url = `${config.baseUrl}/${methodName}?${sortedParams}&apiSig=${apiSig}`;

  try {
    const res = await axios.get(url, { timeout: 10000 });
    
    if (res.data.status === 'OK') {
      return res.data.result;
    } else {
      throw new Error(res.data.comment || 'Error desconocido de la API');
    }
  } catch (err) {
    if (err.response) {
      console.error(`❌ Error API Codeforces [${methodName}]:`, err.response.data?.comment || err.message);
    } else {
      console.error(`❌ Error de red llamando a Codeforces [${methodName}]:`, err.message);
    }
    throw err;
  }
}

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

module.exports = {
  callCodeforcesApi,
  getUserSubmissions,
  getUserInfo
};
