const axios = require('axios');
const { DateTime } = require('luxon');

/**
 * Fetches LeetCode contests from https://leetcode.com/graphql
 * Returns an array of contest objects normalized to the DB schema.
 * Uses 'allContests' query to get both duplicate and past contests.
 */
const scrapeLeetCode = async () => {
    try {
        const response = await axios.post('https://leetcode.com/graphql', {
            query: `
            {
                allContests {
                    title
                    titleSlug
                    startTime
                    duration
                    originStartTime
                    isVirtual
                }
            }
            `
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://leetcode.com/contest/'
            },
            timeout: 10000
        });

        if (!response.data || !response.data.data || !response.data.data.allContests) {
            console.error('Invalid LeetCode GraphQL response');
            return [];
        }

        const rawContests = response.data.data.allContests;
        const contests = [];
        const nowSeconds = Math.floor(DateTime.now().toSeconds());

        for (const c of rawContests) {
            // Filter out unusual contests or ensure fields exist?
            // LeetCode data seems clean.
            // isVirtual = true usually means it's a permanent virtual contest? 
            // The list contains "Weekly Contest X".
            
            // Map Phase
            let phase = 'FINISHED';
            if (c.startTime > nowSeconds) {
                phase = 'BEFORE';
            } else if (c.startTime <= nowSeconds && nowSeconds < c.startTime + c.duration) {
                phase = 'CODING';
            }

            // Only include upcoming and active contests
            if (phase === 'FINISHED') continue;


            contests.push({
                id: c.titleSlug,
                name: c.title,
                type: 'LEETCODE',
                phase: phase,
                frozen: false,
                durationSeconds: c.duration,
                startTimeSeconds: c.startTime,
                relativeTimeSeconds: c.startTime - nowSeconds,
                platform: 'LEETCODE'
            });
        }
        
        return contests;
        
    } catch (err) {
        console.error('Error fetching LeetCode GraphQL:', err.message);
        return [];
    }
};

module.exports = scrapeLeetCode;
