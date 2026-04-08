const axios = require('axios');

const ATCODER_SUBMISSIONS_API = 'https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions';
const ATCODER_PROBLEMS_API = 'https://kenkoooo.com/atcoder/resources/problems.json';

let problemsCache = null;
let problemsCacheAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1h

async function loadProblemsMap() {
  const now = Date.now();
  if (problemsCache && now - problemsCacheAt < CACHE_TTL_MS) {
    return problemsCache;
  }

  const response = await axios.get(ATCODER_PROBLEMS_API, { timeout: 10000 });
  const map = new Map();

  for (const problem of response.data || []) {
    if (problem?.id) {
      map.set(problem.id, problem.title || problem.id);
    }
  }

  problemsCache = map;
  problemsCacheAt = now;
  return map;
}

async function getUserSubmissions(handle, fromSecond = 0) {
  const response = await axios.get(ATCODER_SUBMISSIONS_API, {
    params: {
      user: handle,
      from_second: fromSecond
    },
    timeout: 15000
  });

  return Array.isArray(response.data) ? response.data : [];
}

async function normalizeAcceptedSubmissions(handle, fromSecond = 0) {
  const [submissions, problemsMap] = await Promise.all([
    getUserSubmissions(handle, fromSecond),
    loadProblemsMap().catch(() => new Map())
  ]);

  // Keep latest accepted submission per problem.
  const bestByProblem = new Map();

  for (const sub of submissions) {
    if (sub.result !== 'AC') continue;
    if (!sub.problem_id) continue;

    const existing = bestByProblem.get(sub.problem_id);
    if (!existing || (sub.epoch_second || 0) > (existing.epoch_second || 0)) {
      bestByProblem.set(sub.problem_id, sub);
    }
  }

  return Array.from(bestByProblem.values())
    .sort((a, b) => (b.epoch_second || 0) - (a.epoch_second || 0))
    .map((sub) => {
      const contestId = sub.contest_id || String(sub.problem_id).split('_')[0] || 'atcoder';
      const problemId = sub.problem_id;
      return {
        platform: 'ATCODER',
        contestId,
        problemIndex: problemId,
        problemName: problemsMap.get(problemId) || problemId,
        rating: null,
        tags: [],
        submissionTime: new Date((sub.epoch_second || 0) * 1000).toISOString().slice(0, 19).replace('T', ' ')
      };
    });
}

module.exports = {
  getUserSubmissions,
  normalizeAcceptedSubmissions
};
