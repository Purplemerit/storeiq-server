// server/src/routes/authMiddleware.js

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  // Log the content-type to confirm multipart/form-data requests
  console.log(`[authMiddleware] Content-Type: ${req.headers['content-type'] || 'N/A'}`);

  // Log the incoming Authorization header
  console.log(`[authMiddleware] Incoming Authorization header:`, req.headers['authorization']);

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error(`[authMiddleware] Authorization header missing or malformed`);
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.error(`[authMiddleware] Token missing in Authorization header`);
    return res.status(401).json({ error: 'Token missing' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error(`[authMiddleware] JWT verification failed:`, err);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.log(`[authMiddleware] JWT verified successfully. Decoded user:`, user);
    req.user = user;
    // Ensure req.user._id is set to decoded.id for downstream compatibility
    if (user && user.id) {
      req.user._id = user.id;
    }
    if (req.user) {
      console.log(`[authMiddleware] req.user is set. Proceeding to next middleware.`);
    } else {
      console.error(`[authMiddleware] req.user is NOT set after JWT verification!`);
    }
    next();
  });
}

module.exports = authMiddleware;