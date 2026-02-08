const express = require('express');
const router = express.Router();
const chatService = require('../services/chatService');
const { logAction } = require('../services/auditService');


// Simple ID generator
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// POST /api/chat/message
router.post('/message', async (req, res) => {
  try {
    const { sessionId, handle, message } = req.body;
    
    if (!sessionId || !handle || !message) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Log the attempt/query (before or after processing? After success is usually better for "completed actions", 
    // but for audit we might want to know they asked. Let's log successful processing for now)
    
    const response = await chatService.processMessage(sessionId, handle, message, clientIp);
    
    // Audit Log: User Chat Query
    // We log as adminId: null (system/user action)
    await logAction({ 
        adminId: null, 
        action: 'CHAT_QUERY', 
        details: { 
            handle, 
            sessionId, 
            message: message.length > 200 ? message.substring(0, 200) + '...' : message 
        }, 
        ip: clientIp, 
        userAgent: req.get('User-Agent') 
    });

    res.json({ success: true, response });
  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/chat/history/:sessionId
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = await chatService.getHistory(sessionId);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/chat/reset
router.post('/reset', async (req, res) => {
  try {
    const { sessionId } = req.body;
    await chatService.clearHistory(sessionId);
    res.json({ success: true, message: 'Chat history cleared', newSessionId: generateId() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
