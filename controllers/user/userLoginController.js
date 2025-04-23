const bcrypt = require('bcrypt');
const User = require('../../models/userSchema');

const loadLogin = async (req, res) => {
    try {
        if (!req.session.user && !req.user) {
            return res.render('login');
        } else {
            return res.redirect('/');
        }
    } catch (err) {
        console.error('Load login error:', err);
        res.redirect('/error');
    }
};

const login = async (req, res) => {
    try {
        let { email, password } = req.body;
    
        email = email.trim();
        password = password.trim();

        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
            return res.render('login', { message: 'Invalid email format' });
        }

        if (password.length < 6) {
            return res.render('login', { message: 'Password must be at least 6 characters long' });
        }

        const findUser = await User.findOne({ isAdmin: 0, email });
        if (!findUser) {
            return res.render('login', { message: 'User not found' });
        }

        if (findUser.isBlocked) {
            return res.render('login', { message: 'Your account is blocked. Contact support.' });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            return res.render('login', { message: 'Incorrect password' });
        }

        req.session.user = findUser._id;
        req.session.save(() => {
            res.redirect('/');
        });

    } catch (err) {
        console.error('Login error:', err);
        res.render('login', { message: 'Something went wrong. Try again later.' });
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
                return res.redirect('/error');
            }
            res.redirect('/');
        });
    } catch (err) {
        console.error('Logout error:', err);
        res.redirect('/error');
    }
};

module.exports = { loadLogin, login, logout };
