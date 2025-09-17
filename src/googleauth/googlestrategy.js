const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const AuthUser = require("../models/User"); // unified schema

passport.serializeUser((user, done) => {
  done(null, user.id); // store only MongoDB _id
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await AuthUser.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // First check if user exists by googleId
        let user = await AuthUser.findOne({ googleId: profile.id });

        if (!user) {
          // Maybe they logged in with GitHub before → check by email
          user = await AuthUser.findOne({ email: profile.emails[0].value });

          if (user) {
            // Link Google account to existing user
            user.googleId = profile.id;
            user.avatar = user.avatar || profile.photos[0]?.value;
            await user.save();
          } else {
            // Create new user
            user = new AuthUser({
              googleId: profile.id,
              username: profile.displayName,
              email: profile.emails[0].value,
              avatar: profile.photos[0]?.value,
            });
            await user.save();
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
