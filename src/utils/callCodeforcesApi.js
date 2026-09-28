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
const callCodeforcesApi = async (methodName, params = {}, options = {}) => {
  const apiKey = process.env.API_KEY_CF;
  const secret = process.env.API_SECRET_CF;
  const anonymous = options.anonymous === true;

  if (!anonymous && (!apiKey || !secret)) {
    console.warn('API_KEY_CF or API_SECRET_CF not configured');
    // Proceeding might fail for private methods, but some public ones might work without auth?
    // Actually, the user snippet forces auth. Let's assume auth is required or preferred.
  }

  const time = Math.floor(Date.now() / 1000);
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');

  // Regular public contest standings must be requested anonymously with only
  // contestId. Adding apiKey/time/apiSig or pagination causes HTTP 400.
  const fullParams = anonymous
    ? { contestId: params.contestId }
    : {
        ...params,
        apiKey,
        time,
      };

  // Sort alphabetically by key, then value
  const sortedParams = Object.entries(fullParams)
    .sort(([k1, v1], [k2, v2]) => k1.localeCompare(k2) || String(v1).localeCompare(String(v2)))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const url = anonymous
    ? `https://codeforces.com/api/${methodName}?${sortedParams}`
    : (() => {
        const stringToHash = `${rand}/${methodName}?${sortedParams}#${secret}`;
        const hash = crypto.createHash('sha512').update(stringToHash).digest('hex');
        const apiSig = `${rand}${hash}`;
        return `https://codeforces.com/api/${methodName}?${sortedParams}&apiSig=${apiSig}`;
      })();

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
      try {
          const res = await axios.get(url, { timeout: 15000 }); // 15s timeout
          if (res.data.status === 'OK') {
              return res.data.result;
          } else {
              throw new Error(res.data.comment || 'Codeforces API Error');
          }
      } catch (err) {
          attempt++;
          const isTimeout = err.code === 'ECONNABORTED';
          const status = err.response?.status;
          const isRateLimit = status === 429;
          const isClientError = status >= 400 && status < 500 && !isRateLimit;
          const apiComment = err.response?.data?.comment;

          if (apiComment && err.message !== apiComment) {
              err.message = apiComment;
          }

          if (isClientError) {
              console.error(`❌ CF API Failed [${methodName}] with HTTP ${status}: ${err.message}`);
              throw err;
          }
          
          if (attempt >= MAX_RETRIES) {
               console.error(`❌ CF API Failed [${methodName}] after ${MAX_RETRIES} attempts: ${err.message}`);
               throw err;
          }

          // Backoff
          const delay = isRateLimit ? 1000 * attempt : 500;
          if (isTimeout) console.warn(`⚠️ Timeout [${methodName}], retrying (${attempt}/${MAX_RETRIES})...`);
          else console.warn(`⚠️ Error [${methodName}], retrying in ${delay}ms...`);
          
          await new Promise(r => setTimeout(r, delay));
      }
  }
};

module.exports = callCodeforcesApi;
