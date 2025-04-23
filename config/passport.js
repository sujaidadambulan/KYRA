const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
    scope: ["profile", "email"]
}, 
async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
            user = new User({
                fullname: profile.displayName || `${profile.name.givenName} ${profile.name.familyName}`,
                email: profile.emails[0].value,
                googleId: profile.id
            });
            await user.save(); 
        } else {
            
            user.fullname = profile.displayName || `${profile.name.givenName} ${profile.name.familyName}`;
            await user.save();
        }
        
        return done(null, user);
    } catch (err) {
        console.error('Google auth error:', err);
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id.toString());
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        console.error('Deserialize error:', err);
        done(err, null);
    }
});

module.exports = passport;