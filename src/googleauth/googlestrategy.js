const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User"); // unified schema

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // First check if user exists by googleId
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          // Maybe they logged in with GitHub before → check by email
          user = await User.findOne({ email: profile.emails[0].value });

          if (user) {
            // Link Google account to existing user
            user.googleId = profile.id;
            // Always update avatar from Google if available
            if (profile.photos && profile.photos[0] && profile.photos[0].value) {
              user.avatar = profile.photos[0].value;
            }
            await user.save();
          } else {
            // Create new user
            user = new User({
              googleId: profile.id,
              username: profile.displayName,
              email: profile.emails[0].value,
              avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : undefined,
            });
            await user.save();
          }
        } else {
          // User already exists with googleId - update avatar if available
          if (profile.photos && profile.photos[0] && profile.photos[0].value) {
            user.avatar = profile.photos[0].value;
          }
        }

        // Store the tokens
        user.googleAccessToken = accessToken;
        if (refreshToken) {
          user.googleRefreshToken = refreshToken;
        }
        
        await user.save();

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
