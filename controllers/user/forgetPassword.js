const bcrypt = require('bcrypt');
const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
require('dotenv').config();

const forgetPassword = async (req, res) => {
    try {
        res.render('forget-password');
    } catch (err) {
        console.log('Error rendering forget password page:', err);
        res.redirect('/error');
    }
};

const loadVerifyResetOtp = async (req, res) => {
    try {
        if (!req.session.resetEmail) {
            console.log('No reset email in session, redirecting to forget-password');
            return res.redirect('/forget-password');
        }
        res.render('verify-reset-otp');
    } catch (err) {
        console.log('Error rendering verify-reset-otp:', err);
        res.redirect('/error');
    }
};

function otpGenerate() {
    return Math.floor(100000 + Math.random() * 900000).toString();
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
            subject: 'Password Reset OTP',
            text: `Your OTP for password reset is: ${otp}`,
            html: `<b>Your OTP for password reset: ${otp}</b><br><p>This OTP is valid for 10 minutes.</p>`
        });

        return info.accepted.length > 0;  
    } catch (err) {
        console.log('Sending email error:', err);
        return false;
    }
}

const sendResetLink = async (req, res) => {
    try {
        const { email } = req.body;
 
        const user = await User.findOne({ email });
        if (!user) {
            console.log('User not found for email:', email);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const otp = otpGenerate();
        req.session.resetOtp = otp;
        req.session.resetEmail = email;
        
        console.log('Generated OTP:', otp);

        const emailSent = await sendEmailVerification(email, otp);
        
        if (emailSent) {
            res.json({ success: true, redirectUrl: '/verify-reset-otp' }); 
        } else {
            console.log('Email sending failed for:', email);
            res.status(400).json({ success: false, message: 'Failed to send OTP. Please try again.' });
        }
    } catch (err) {
        console.log('Error in sendResetLink:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const verifyResetOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!req.session.resetOtp || !req.session.resetEmail) {
            console.log('Session data missing');
            return res.status(400).json({ success: false, message: 'Session expired. Please request a new OTP.' });
        }

        if (otp === req.session.resetOtp) {
            console.log('OTP verification successful');
            res.json({ success: true, redirectUrl: '/new-password' });
        } else {
            console.log('OTP verification failed - mismatch');
            res.status(400).json({ success: false, message: 'Invalid OTP, Please Try again' });
        }
    } catch (err) {
        console.log('Error in verifyResetOtp:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { password } = req.body;
        const email = req.session.resetEmail;

        console.log('Reset password attempt for:', email);
        console.log('Received password:', password);

        if (!email) {
            console.log('Session expired');
            return res.status(400).json({ success: false, message: 'Session expired' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await User.updateOne(
            { email: email },
            { $set: { password: hashedPassword } }
        );


        delete req.session.resetOtp;
        delete req.session.resetEmail;

        res.json({ success: true, message: 'Password reset successful' }); 
    } catch (err) {
        console.log('Error in resetPassword:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const newPassword = async (req, res) => {
    try {
        if (!req.session.resetEmail) {
            console.log('No reset email in session, redirecting to forget-password');
            return res.redirect('/forget-password');
        }
        res.render('newPassword');
    } catch (err) {
        console.log('Error rendering newPassword:', err);
        res.redirect('/error');
    }
};

module.exports = {
    forgetPassword,
    loadVerifyResetOtp, 
    sendResetLink,
    verifyResetOtp,
    resetPassword,
    newPassword
};

