const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
require('dotenv').config();
const bcrypt = require('bcrypt');
const { text } = require('express');

const LoadSignup = async (req, res) => {
    try {
        return res.render('signup');
    } catch (err) {
        console.log('Signup page not found');
        res.status(404).send('Error');
    }
};

const LoadOtp = async (req, res) => {
    try {
        return res.render('verify-otp');
    } catch (err) {
        console.log('Signup page not found');
        res.status(404).send('Error');
    }
};

function otpGenerate() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateReferralCode(name) {
    return name.toLowerCase().slice(0, 3) + Math.random().toString(36).substring(2, 7);
}

async function sendEmailVerification(email, otp) {
    try {
        const transPorter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transPorter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: 'Verify Your Account',
            text: `Your OTP is: ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`
        });

        return info.accepted.length > 0;  
    } catch (err) {
        console.log('Sending email error', err);
        return false;
    }
}

const Signup = async (req, res) => {
    try {
        const { fullname, email, phone, password, cpassword  } = req.body;

        if (password !== cpassword) {
            return res.render('signup', { message: 'Passwords do not match' });
        }

        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render('signup', { message: 'User already exists' });
        }

        const otp = otpGenerate();
        const emailSent = await sendEmailVerification(email, otp);

        if (!emailSent) {
            return res.json('email-error');
        }
      
        req.session.userOtp = otp;
        req.session.userData = { fullname, email, phone, password };

        console.log('OTP sent:', otp);
        res.render('verify-otp');  
    } catch (err) {
        console.log('Signup error', err);
        res.redirect('/error');
    }
};

const securePassword = async (password) => {
    try {
        return await bcrypt.hash(password, 10);
    } catch (err) {
        console.log(err);
        return null;
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (otp === req.session.userOtp) {
            const user = req.session.userData;
            const hashPassword = await securePassword(user.password);

            if (!hashPassword) {
                return res.status(500).json({ success: false, message: 'Error hashing password' });
            }
           
            const saveUser = new User({
                fullname: user.fullname,
                email: user.email,
                phone: user.phone,
                password: hashPassword,
                referredBy: user.referredBy || null,
            });

            await saveUser.save();
            req.session.user = saveUser._id;
            res.json({ success: true, redirectUrl: '/' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid OTP, Please Try again' });
        }
    } catch (err) {
        console.log('Error verifying OTP', err);
        res.status(400).json({ success: false, message: 'An error occurred' });
    }
};

const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email not found' });
        }
        const otp = otpGenerate();
        req.session.userOtp = otp;
        const emailSent = await sendEmailVerification(email, otp);
        if (emailSent) {
            console.log(otp)
            res.status(200).json({ success: true, message: 'OTP resent successfully' });
        } else {
            res.status(400).json({ success: false, message: 'Try again' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


module.exports = { LoadSignup, Signup ,verifyOtp , LoadOtp , resendOtp};
