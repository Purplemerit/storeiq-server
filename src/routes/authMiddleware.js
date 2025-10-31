// server/src/routes/authMiddleware.js

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  let token;
  const authDebug = {
    hasCookie: !!req.cookies?.token,
    hasAuthHeader: !!req.headers['authorization'],
    cookies: Object.keys(req.cookies || {}),
    headers: Object.keys(req.headers || {}),
    origin: req.headers.origin,
    method: req.method
  };



  // 1️⃣ Try cookie first (OAuth login)
  if (req.cookies?.token) {
    token = req.cookies.token;
  }

  // 2️⃣ Fallback to Authorization header (Bearer token)
  if (!token && req.headers['authorization']?.startsWith('Bearer ')) {
    token = req.headers['authorization'].split(' ')[1];
  }

  // 3️⃣ Token not found
  if (!token) {
    console.error('[authMiddleware] Authentication failed:', {
      cookies: authDebug.cookies,
      headers: authDebug.headers,
      origin: req.headers.origin,
      method: req.method
    });
    return res.status(401).json({
      error: 'Authentication failed',
      details: 'No valid token found in cookies or Authorization header'
    });
  }

  // 4️⃣ Verify JWT
  if (!JWT_SECRET) {
    console.error('[authMiddleware] JWT_SECRET is not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      console.error('[authMiddleware] JWT verification failed:', {
        error: err.message,
        name: err.name,
        tokenLength: token?.length,
        tokenFirstChars: token?.substring(0, 10) + '...',
        hasJwtSecret: !!JWT_SECRET
      });
      
      let errorMessage = 'Token validation failed';
      if (err.name === 'TokenExpiredError') {
        errorMessage = 'Your session has expired. Please log in again.';
      } else if (err.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid authentication token';
      }
      
      return res.status(401).json({
        error: errorMessage,
        code: err.name,
        requiresReauth: err.name === 'TokenExpiredError'
      });
    }

    // 5️⃣ Attach user info to req.user
    req.user = {
      _id: decoded.id,
      email: decoded.email,
      username: decoded.username,
    };

    // If email or username is missing, fetch from DB and attach both
    if (!req.user.username || !req.user.email) {
      const User = require('../models/User');
      try {
        const userDoc = await User.findById(req.user._id);
        if (userDoc) {
          req.user = {
            ...req.user,
            username: userDoc.username || req.user.username,
            email: userDoc.email || req.user.email
          };
        }
      } catch (err) {
        console.error('[authMiddleware] Failed to fetch user from DB:', {
          userId: req.user._id,
          error: err.message
        });
      }
    }
    next();
  });
}

module.exports = authMiddleware;
