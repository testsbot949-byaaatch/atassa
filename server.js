const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// ============================================
//  List of public Invidious instances (updated)
// ============================================
const INV_INSTANCES = [
    'https://yewtu.be',                // Very reliable
    'https://invidious.snopyta.org',   // Good uptime
    'https://invidious.fdn.fr',
    'https://inv.riverside.rocks',
    'https://invidious.kavin.rocks',   // Official – may be rate-limited
    'https://invidious.private.coffee',
    'https://invidious.nerdvpn.de',
    'https://iv.melmac.net'
];

// ============================================
//  Utility: fetch from Invidious with fallback
// ============================================
async function invidiousFetch(endpoint, retries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt < retries; attempt++) {
        for (const base of INV_INSTANCES) {
            try {
                const url = `${base}${endpoint}`;
                const response = await axios.get(url, {
                    timeout: 15000,  // increased timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; Atassa/1.0)'
                    }
                });
                return response.data;
            } catch (e) {
                console.warn(`Instance ${base} failed:`, e.message);
                lastError = e;
                // Wait a bit before next instance
                await new Promise(r => setTimeout(r, 500));
            }
        }
        // Wait before retry all over again
        if (attempt < retries - 1) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error(`All Invidious instances failed: ${lastError?.message || 'unknown error'}`);
}

// ============================================
//  Health check
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
//  Search endpoint (Invidious)
// ============================================
app.post('/api/search', async (req, res) => {
    const { query, limit = 10 } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Missing "query" parameter' });
    }

    try {
        const data = await invidiousFetch(`/api/v1/search?q=${encodeURIComponent(query)}&type=video&sortBy=relevance`);
        const results = data.slice(0, limit).map(v => ({
            videoId: v.videoId,
            title: v.title,
            artist: v.author || 'Unknown',
            duration: v.lengthSeconds,
            thumbnail: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
            url: `https://youtube.com/watch?v=${v.videoId}`
        }));
        res.json({
            success: true,
            query,
            count: results.length,
            results
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
//  Stream URL by video ID (Invidious)
// ============================================
app.post('/api/stream', async (req, res) => {
    const { videoId } = req.body;
    if (!videoId) {
        return res.status(400).json({ error: 'Missing "videoId" parameter' });
    }

    try {
        const data = await invidiousFetch(`/api/v1/videos/${videoId}`);
        const audioFormats = data.adaptiveFormats.filter(f => f.type && f.type.startsWith('audio/'));
        const bestAudio = audioFormats.reduce((best, current) => {
            const br = current.bitrate || 0;
            return br > (best.bitrate || 0) ? current : best;
        }, {});
        if (!bestAudio.url) {
            throw new Error('No audio stream found');
        }
        res.json({
            success: true,
            videoId,
            audioUrl: bestAudio.url,
            format: bestAudio.type,
            bitrate: bestAudio.bitrate
        });
    } catch (err) {
        console.error('Stream error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
//  Combined: search + first result stream
// ============================================
app.post('/api/play', async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Missing "query" parameter' });
    }

    try {
        // 1. Search
        const searchData = await invidiousFetch(`/api/v1/search?q=${encodeURIComponent(query)}&type=video&sortBy=relevance`);
        if (!searchData || searchData.length === 0) {
            return res.status(404).json({ error: 'No results found' });
        }
        const video = searchData[0];

        // 2. Get stream
        const videoData = await invidiousFetch(`/api/v1/videos/${video.videoId}`);
        const audioFormats = videoData.adaptiveFormats.filter(f => f.type && f.type.startsWith('audio/'));
        const bestAudio = audioFormats.reduce((best, current) => {
            return (current.bitrate || 0) > (best.bitrate || 0) ? current : best;
        }, {});
        if (!bestAudio.url) {
            throw new Error('No audio stream found');
        }

        res.json({
            success: true,
            title: video.title,
            artist: video.author || 'Unknown',
            duration: video.lengthSeconds,
            thumbnail: `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
            audioUrl: bestAudio.url,
            videoUrl: `https://youtube.com/watch?v=${video.videoId}`,
            source: `https://youtube.com/watch?v=${video.videoId}`
        });
    } catch (err) {
        console.error('Play error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
//  Start server
// ============================================
app.listen(port, () => {
    console.log(`\n=================================`);
    console.log(`🎵 Invidious Music Engine Server`);
    console.log(`URL: http://localhost:${port}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`=================================\n`);
});
