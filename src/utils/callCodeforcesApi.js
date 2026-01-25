const crypto = require('crypto');
const axios = require('axios');

/**
 * Calls the Codeforces API with the specified method and parameters.
 *
 * This function generates the required API signature using the provided API key
 * and secret, constructs the request URL, and sends a GET request to the Codeforces API.
 *
 * @async
 * @function callCodeforcesApi
 * @param {string} methodName - The name of the API method to call (e.g., "contest.list").
 * @param {Object} [params={}] - An object containing the parameters to include in the API request.
 * @returns {Promise<Object|undefined>} The result of the API call if successful, or undefined if an error occurs.
 * @throws {Error} Throws an error if the API response status is not "OK".
 */
const callCodeforcesApi = async (methodName, params = {}) => {
  const apiKey = process.env.API_KEY_CF;
  const secret = process.env.API_SECRET_CF;

  if (!apiKey || !secret) {
    console.warn('API_KEY_CF or API_SECRET_CF not configured');
    // Proceeding might fail for private methods, but some public ones might work without auth?
    // Actually, the user snippet forces auth. Let's assume auth is required or preferred.
  }

  const time = Math.floor(Date.now() / 1000);
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');

  // Add mandatory parameters
  const fullParams = {
    ...params,
    apiKey,
    time,
  };

  // Sort alphabetically by key, then value
  const sortedParams = Object.entries(fullParams)
    .sort(([k1, v1], [k2, v2]) => k1.localeCompare(k2) || String(v1).localeCompare(String(v2)))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  // Construct string to hash
  const stringToHash = `${rand}/${methodName}?${sortedParams}#${secret}`;

  const hash = crypto.createHash('sha512').update(stringToHash).digest('hex');
  const apiSig = `${rand}${hash}`;

  const url = `https://codeforces.com/api/${methodName}?${sortedParams}&apiSig=${apiSig}`;

  try {
    const res = await axios.get(url);
    if (res.data.status === 'OK') {
      return res.data.result;
    } else {
      throw new Error(res.data.comment);
    }
  } catch (err) {
    console.error(`Error codeforces API (${methodName}):`, err.message);
    throw err; 
  }
};

module.exports = callCodeforcesApi;
