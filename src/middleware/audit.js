const { logAction } = require('../services/auditService');

const auditMiddleware = async (req, res, next) => {
  // Capture request details
  // Note: req.admin might not be set yet if this runs before auth middleware
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  // We allow the request to proceed and log in background
  next();

  // Log only API requests to reduce noise, avoiding double logging for specific actions if desired.
  // However, the specific actions (like CREATE_USER) are logged explicitly in controllers.
  // This middleware is good for general traffic analysis.
  // We can filter out GET requests if too noisy, or keep them.
  // For now, let's log everything but maybe with a generic action name.
  
  if (req.originalUrl.startsWith('/api')) {
      // Use setImmediate to not block the event loop? 
      // Actually logAction is async but we don't await it here to not delay response? 
      // Or valid to just call it.
      logAction({
          adminId: req.admin?.id || null, // Might be null if not authenticated yet
          action: `${req.method}_REQUEST`, // e.g. GET_REQUEST, POST_REQUEST
          details: { endpoint: req.originalUrl },
          ip,
          userAgent
      }).catch(err => console.error('Audit Middleware Error:', err.message));
  }
};

module.exports = auditMiddleware;
