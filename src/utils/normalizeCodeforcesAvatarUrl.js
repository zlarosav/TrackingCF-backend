/**
 * Codeforces currently serves user pictures reliably through the main domain
 * proxy, while the userpic subdomain can respond with HTTP 503.
 */
function normalizeCodeforcesAvatarUrl(avatarUrl) {
  if (!avatarUrl) return null;

  let normalized = String(avatarUrl).trim();
  if (!normalized) return null;

  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`;
  } else if (normalized.startsWith('/')) {
    normalized = `https://codeforces.com${normalized}`;
  }

  try {
    const url = new URL(normalized);
    if (url.hostname === 'userpic.codeforces.org') {
      return `https://codeforces.com/userpic.codeforces.org${url.pathname}${url.search}`;
    }
  } catch {
    // Preserve the original value if Codeforces returns an unexpected format.
  }

  return normalized;
}

module.exports = normalizeCodeforcesAvatarUrl;
