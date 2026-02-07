const axios = require('axios');
const cheerio = require('cheerio');
const { DateTime } = require('luxon');

/**
 * Fetches AtCoder contests from Official Website (Scraping)
 * Only upcoming and active contests are included.
 */
const fetchAtCoder = async () => {
    let contests = [];
    const nowSeconds = Math.floor(DateTime.now().toSeconds());
    const seenIds = new Set();

    // 1. Scrape Official Site (Upcoming & Active)
    try {
        const response = await axios.get('https://atcoder.jp/contests/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        // Helper to parse rows
        const parseTable = (selector, defaultPhase) => {
            $(selector).find('tbody tr').each((i, el) => {
                try {
                     const $cols = $(el).find('td');
                     if ($cols.length < 2) return;

                     // Start Time: usually in <time class="fixtime"> or raw text
                     // AtCoder uses <time class="fixtime">YYYY-MM-DD HH:mm:ss+0900</time>
                     let timeStr = $cols.find('.fixtime').text().trim();
                     if (!timeStr) return;
                     
                     // Convert to ISO: "2026-01-25 21:00:00+0900" -> "2026-01-25T21:00:00+0900"
                     const isoStr = timeStr.replace(' ', 'T');
                     const dt = DateTime.fromISO(isoStr);
                     
                     if (!dt.isValid) {
                         console.log(`Invalid date: ${timeStr}`);
                         return;
                     }
                     
                     const startTimeSeconds = Math.floor(dt.toSeconds());

                     // Name & ID
                     const $link = $cols.eq(1).find('a').first();
                     const name = $link.text().trim();
                     const href = $link.attr('href'); // /contests/abc123
                     const id = href ? href.split('/').pop() : null;
                     
                     if (!id || !name) return;

                     // Duration is usually col 2 (0-indexed) -> "01:40" or "100:00"
                     const durStr = $cols.eq(2).text().trim(); // HH:mm
                     const [h, m] = durStr.split(':').map(Number);
                     const durationSeconds = (h * 3600) + (m * 60);

                     // Phase
                     let phase = defaultPhase;
                     if (startTimeSeconds > nowSeconds) phase = 'BEFORE';
                     else if (startTimeSeconds + durationSeconds > nowSeconds) phase = 'CODING';
                     else phase = 'FINISHED';

                     contests.push({
                         id,
                         name,
                         type: 'ATCODER',
                         phase,
                         frozen: false,
                         durationSeconds,
                         startTimeSeconds,
                         relativeTimeSeconds: startTimeSeconds - nowSeconds,
                         platform: 'ATCODER'
                     });
                     seenIds.add(id);

                } catch (err) {
                    console.error('Error parsing AtCoder row:', err.message);
                }
            });
        };

        // Parse "Active Contests" (id=contest-table-action) -> Wait, AtCoder uses specific IDs usually
        // Upcoming: #contest-table-upcoming
        // Active: #contest-table-action
        
        parseTable('#contest-table-action', 'CODING');
        parseTable('#contest-table-upcoming', 'BEFORE');
        
    } catch (err) {
        console.error('Error scraping AtCoder:', err.message);
    }


    return contests;
};

module.exports = fetchAtCoder;
