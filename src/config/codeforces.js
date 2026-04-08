require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

module.exports = {
  apiKey: process.env.API_KEY_CF || '',
  apiSecret: process.env.API_SECRET_CF || '',
  baseUrl: 'https://codeforces.com/api'
};
