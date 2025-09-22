// server/src/routes/authMiddleware.js

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  let token;

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
    console.error('[authMiddleware] No token found in cookie or Authorization header');
    return res.status(401).json({ error: 'User not authenticated (no token found)' });
  }

  // 4️⃣ Verify JWT
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('[authMiddleware] JWT verification failed:', err);
      return res.status(401).json({ error: 'Invalid or expired token' });
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
          User.findById(req.user._id)
            .then(userDoc => {
              if (userDoc) {
                if (!req.user.username && userDoc.username) {
                  req.user.username = userDoc.username;
                }
                if (!req.user.email && userDoc.email) {
                  req.user.email = userDoc.email;
                }
              }
              next();
            })
            .catch(err => {
              console.error('[authMiddleware] Failed to fetch user from DB:', err);
              next();
            });
        } else {
          next();
        }
  });
}

module.exports = authMiddleware;
