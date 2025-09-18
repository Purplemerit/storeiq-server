const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const User = require("../models/User"); // unified schema

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "/auth/github/callback",
      scope: ["user:email"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // 1. Check if user exists by githubId
        let user = await User.findOne({ githubId: profile.id });

        if (!user) {
          // 2. Check by email (maybe they used Google before)
          const email = profile.emails?.[0]?.value;
          if (email) {
            user = await User.findOne({ email });
          }

          if (user) {
            // Link GitHub account
            user.githubId = profile.id;
            user.avatar = user.avatar || profile.photos?.[0]?.value;
            await user.save();
          } else {
            // 3. Register new user
            user = new User({
              githubId: profile.id,
              username: profile.username,
              email: email || null,
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
