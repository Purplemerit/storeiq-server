const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const AuthUser = require("../models/User"); // your unified user model

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: "/auth/facebook/callback",
      profileFields: ["id", "displayName", "emails", "picture.type(large)"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await AuthUser.findOne({ facebookId: profile.id });

        if (!user) {
          // Check by email if user already exists (Google/GitHub)
          const email = profile.emails?.[0]?.value;
          if (email) user = await AuthUser.findOne({ email });

          if (user) {
            user.facebookId = profile.id;
            user.avatar = user.avatar || profile.photos?.[0]?.value;
            await user.save();
          } else {
            user = new AuthUser({
              facebookId: profile.id,
              email,
              username: profile.displayName,
              avatar: profile.photos?.[0]?.value,
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
