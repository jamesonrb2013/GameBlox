const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

passport.use(
    new DiscordStrategy(
        {
            clientID: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
            callbackURL: "https://gameblox.onrender.com/auth/discord/callback",
            scope: ["identify"]
        },
        (accessToken, refreshToken, profile, done) => {
            return done(null, profile);
        }
    )
);

module.exports = passport;