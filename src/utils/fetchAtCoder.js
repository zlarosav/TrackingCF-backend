const axios = require('axios');
const cheerio = require('cheerio');
const { DateTime } = require('luxon');

/**
 * Fetches AtCoder contests from:
 * 1. Official Website (Scraping) -> For Upcoming/Active (Most accurate)
 * 2. Kenkoooo API -> For Past/History
 */
const fetchAtCoder = async () => {
    let contests = [];
    const nowSeconds = Math.floor(DateTime.now().toSeconds());
    const seenIds = new Set();

    // 1. Scrape Official Site (Upcoming & Active)
    try {
        console.log('Scraping AtCoder Official Site...');
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
        
        console.log(`Scraped ${contests.length} upcoming/active AtCoder contests.`);

    } catch (err) {
        console.error('Error scraping AtCoder:', err.message);
    }

    // 2. Fetch History from Kenkoooo (Fallback & Past)
    try {
        console.log('Fetching AtCoder history from Kenkoooo...');
        const response = await axios.get('https://kenkoooo.com/atcoder/resources/contests.json', {
            timeout: 10000
        });

        if (response.data && Array.isArray(response.data)) {
             console.log(`Kenkoooo returned ${response.data.length} items`);
             
             response.data.forEach(c => {
                 if (seenIds.has(c.id)) return; // Don't overwrite scraped data
                 
                 // Filter out "permanent"
                 if (c.duration_second > 30 * 24 * 3600) return;
                 
                  // Relaxed Filter: ID regex OR Title match
                 const isStandardID = /^(abc|arc|ahc)\d{3}$/i.test(c.id);
                 const isStandardTitle = /AtCoder (Beginner|Regular|Heuristic) Contest/i.test(c.title);
                 if (!isStandardID && !isStandardTitle) return;

                 let phase = 'FINISHED';
                 if (c.start_epoch_second > nowSeconds) phase = 'BEFORE';
                 else if (c.start_epoch_second <= nowSeconds && nowSeconds < c.start_epoch_second + c.duration_second) phase = 'CODING';
                 
                 // Filter to last 1 year for history to avoid bloating DB
                 const oneYearAgo = nowSeconds - 365 * 24 * 3600;
                 if (c.start_epoch_second < oneYearAgo && phase === 'FINISHED') return;

                 contests.push({
                     id: c.id,
                     name: c.title,
                     type: 'ATCODER',
                     phase: phase,
                     frozen: false,
                     durationSeconds: c.duration_second,
                     startTimeSeconds: c.start_epoch_second,
                     relativeTimeSeconds: c.start_epoch_second - nowSeconds,
                     platform: 'ATCODER'
                 });
             });
        }
    } catch (err) {
        console.error('Error fetching Kenkoooo:', err.message);
    }

    return contests;
};

module.exports = fetchAtCoder;
