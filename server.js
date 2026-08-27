const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// ============================================
//  Health check
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
//  Search endpoint
// ============================================
app.post('/api/search', async (req, res) => {
    const { query, limit = 10 } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Missing "query" parameter' });
    }

    try {
        const { searchYouTube } = await import('yt-music-engine');
        const results = await searchYouTube(query, { limit });
        res.json({
            success: true,
            query,
            count: results.length,
            results: results.map(v => ({
                videoId: v.videoId,
                title: v.title,
                artist: v.artist || 'Unknown',
                duration: v.duration,
                thumbnail: v.thumbnail,
                url: `https://youtube.com/watch?v=${v.videoId}`
            }))
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
//  Get stream URL by video ID
// ============================================
app.post('/api/stream', async (req, res) => {
    const { videoId } = req.body;
    if (!videoId) {
        return res.status(400).json({ error: 'Missing "videoId" parameter' });
    }

    try {
        const { getStreamUrls } = await import('yt-music-engine');
        const streams = await getStreamUrls(videoId);
        res.json({
            success: true,
            videoId,
            audioUrl: streams.audioUrl,
            videoUrl: streams.videoUrl,
            format: streams.format || 'mp4'
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
        const { searchYouTube, getStreamUrls } = await import('yt-music-engine');
        const results = await searchYouTube(query, { limit: 1 });
        if (!results || results.length === 0) {
            return res.status(404).json({ error: 'No results found' });
        }
        const video = results[0];
        const streams = await getStreamUrls(video.videoId);
        res.json({
            success: true,
            title: video.title,
            artist: video.artist || 'Unknown',
            duration: video.duration,
            thumbnail: video.thumbnail,
            audioUrl: streams.audioUrl,
            videoUrl: streams.videoUrl,
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
    console.log(`🎵 YouTube Music Engine Server`);
    console.log(`URL: http://localhost:${port}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`=================================\n`);
});
