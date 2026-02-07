const db = require('../config/database');
const callCodeforcesApi = require('../utils/callCodeforcesApi');
const scrapeLeetCode = require('../utils/scrapeLeetCode');
const fetchAtCoder = require('../utils/fetchAtCoder');
const fetchCodeChef = require('../utils/fetchCodeChef');
const { DateTime } = require('luxon');

const updateContests = async () => {
    let totalCount = 0;

    // Helper for DB Insert
    const upsertContest = async (contest) => {
        const query = `
            INSERT INTO contests (id, name, type, phase, frozen, durationSeconds, startTimeSeconds, relativeTimeSeconds, platform)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            type = VALUES(type),
            phase = VALUES(phase),
            frozen = VALUES(frozen),
            durationSeconds = VALUES(durationSeconds),
            startTimeSeconds = VALUES(startTimeSeconds),
            relativeTimeSeconds = VALUES(relativeTimeSeconds),
            platform = VALUES(platform),
            updated_at = NOW()
        `;
        
        // MySQL INT range: -2147483648 to 2147483647
        const MAX_INT = 2147483647;
        const MIN_INT = -2147483648;
        
        const safeDuration = Math.min(MAX_INT, Math.max(MIN_INT, contest.durationSeconds));
        const safeRelative = Math.min(MAX_INT, Math.max(MIN_INT, contest.relativeTimeSeconds));
        const safeStart = Math.min(MAX_INT, Math.max(MIN_INT, contest.startTimeSeconds));

        await db.query(query, [
            String(contest.id),
            contest.name,
            contest.type,
            contest.phase,
            contest.frozen ? 1 : 0,
            safeDuration,
            safeStart,
            safeRelative,
            contest.platform
        ]);
    };

    // 1. Scrape Official Site (Upcoming & Active)
    try {
        const contests = await callCodeforcesApi('contest.list', { gym: false });
        if (contests && Array.isArray(contests)) {
            const upcomingContests = contests.filter(c => c.phase === 'BEFORE');
            for (const contest of upcomingContests) {
                await upsertContest({
                    ...contest,
                    platform: 'CODEFORCES'
                });
            }
            totalCount += upcomingContests.length;
        }
    } catch (error) {
        console.error('Error updating Codeforces contests:', error.message);
    }

    // 2. Update LeetCode
    try {
        const leetCodeContests = await scrapeLeetCode();
        if (leetCodeContests && leetCodeContests.length > 0) {
            for (const contest of leetCodeContests) {
                await upsertContest(contest);
            }
            totalCount += leetCodeContests.length;
        }
    } catch (error) {
        console.error('Error updating LeetCode contests:', error.message);
    }

    // 3. Update AtCoder
    try {
        const atCoderContests = await fetchAtCoder();
        if (atCoderContests && atCoderContests.length > 0) {
            for (const contest of atCoderContests) {
                try {
                   await upsertContest(contest);
                } catch (innerErr) {
                   console.error(`Failed to insert AtCoder contest ${contest.id}:`, innerErr.message);
                }
            }
            totalCount += atCoderContests.length;
        }
    } catch (error) {
        console.error('Error updating AtCoder contests:', error.message);
    }

    // 4. Update CodeChef
    try {
        const codeChefContests = await fetchCodeChef();
        if (codeChefContests && codeChefContests.length > 0) {
            for (const contest of codeChefContests) {
                await upsertContest(contest);
            }
            totalCount += codeChefContests.length;
        }
    } catch (error) {
        console.error('Error updating CodeChef contests:', error.message);
    }

    // 5. Update Metadata
    try {
        await db.query(`
            INSERT INTO system_metadata (key_name, value) 
            VALUES ('last_contest_update', NOW()) 
            ON DUPLICATE KEY UPDATE value = NOW()
        `);
    } catch (error) {
        console.error('Error updating metadata:', error.message);
    }

    console.log(`✅ Updated ${totalCount} upcoming/active contests from all platforms`);
};

const getUpcomingContests = async () => {
    try {
        const query = `
            SELECT * FROM contests 
            ORDER BY startTimeSeconds ASC
        `;
        const [rows] = await db.query(query);
        
        // Fetch metadata
        const [meta] = await db.query("SELECT value FROM system_metadata WHERE key_name = 'last_contest_update'");
        const lastUpdated = meta && meta.length > 0 ? meta[0].value : null;

        return {
            contests: rows,
            lastUpdated: lastUpdated
        };
    } catch (error) {
        console.error('Error fetching contests:', error);
        throw error;
    }
};

module.exports = {
    updateContests,
    getUpcomingContests
};
