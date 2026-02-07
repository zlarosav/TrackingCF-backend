const axios = require('axios');
const { DateTime } = require('luxon');

/**
 * Fetches CodeChef contests from public API
 * https://www.codechef.com/api/list/contests/all
 */
const fetchCodeChef = async () => {
    try {

        // Note: CodeChef API might require user agent?
        const response = await axios.get('https://www.codechef.com/api/list/contests/all', {
            timeout: 10000,
             headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.data || !response.data.future_contests) {
            console.error('Invalid CodeChef response');
            return [];
        }

        const nowSeconds = Math.floor(DateTime.now().toSeconds());
        const contests = [];
        
        // Helper to process lists
        const processList = (list) => {
            list.forEach(c => {
                // c = { contest_code, contest_name, contest_start_date (ISO), contest_end_date (ISO), ... }
                // Dates are typically "22 Jan 2026 21:30:00" or ISO?
                
                // CodeChef API usually returns "contest_start_date_iso": "2026-01-22T21:30:00+05:30"
                
                const startStr = c.contest_start_date_iso || c.contest_start_date;
                const endStr = c.contest_end_date_iso || c.contest_end_date;
                
                let dtStart = DateTime.fromISO(startStr);
                let dtEnd = DateTime.fromISO(endStr);
                
                if (!dtStart.isValid) dtStart = DateTime.fromFormat(startStr, 'dd LLL yyyy HH:mm:ss', { locale: 'en-US' });
                // If still invalid, try standard parsing
                
                if (dtStart.isValid && dtEnd.isValid) {
                    // Filter: Only allow 'START...' contests
                    if (!c.contest_code || !c.contest_code.startsWith('START')) return;
                    
                    const startTimeSeconds = Math.floor(dtStart.toSeconds());
                    const durationSeconds = Math.floor(dtEnd.toSeconds()) - startTimeSeconds;
                    
                    let phase = 'FINISHED';
                    if (startTimeSeconds > nowSeconds) {
                        phase = 'BEFORE';
                    } else if (startTimeSeconds <= nowSeconds && nowSeconds < startTimeSeconds + durationSeconds) {
                        phase = 'CODING';
                    }
                    
                    contests.push({
                        id: c.contest_code,
                        name: c.contest_name,
                        type: 'CODECHEF',
                        phase: phase,
                        frozen: false,
                        durationSeconds: durationSeconds,
                        startTimeSeconds: startTimeSeconds,
                        relativeTimeSeconds: startTimeSeconds - nowSeconds,
                        platform: 'CODECHEF'
                    });
                }
            });
        };

        if (response.data.present_contests) processList(response.data.present_contests);
        if (response.data.future_contests) processList(response.data.future_contests);


        return contests;

    } catch (err) {
        console.error('Error fetching CodeChef:', err.message);
        return [];
    }
};

module.exports = fetchCodeChef;
