const express = require('express');
const route = express.Router();
const userController = require('../controllers/user/userController');
const userSignup = require('../controllers/user/userSignupController');
const passport = require('../config/passport');
const userLogin = require('../controllers/user/userLoginController');
const { forgetPassword, sendResetLink, verifyResetOtp, resetPassword, newPassword, loadVerifyResetOtp } = require('../controllers/user/forgetPassword');
const userProfile = require('../controllers/user/userProfile');
const cartController = require('../controllers/user/cartController');
const checkOutController = require('../controllers/user/checkoutController');
const walletController = require('../controllers/user/walletController');
const orderController = require('../controllers/user/userOrderController');
const razorpayController = require('../controllers/user/razorpayController');
const wishlistController = require('../controllers/user/wishlistController'); 

route.get('/', userController.loadHomepage);
route.get('/error', userController.errorPage);
route.get('/shop', userController.loadShop);
route.get('/about', userController.loadAbout);
route.get('/contact', userController.loadContact);
route.get('/serverError', userController.serverError);

route.get('/signup', userSignup.LoadSignup);
route.post('/signup', userSignup.Signup);

route.get('/verify-otp', userSignup.LoadOtp);
route.post('/verify-otp', userSignup.verifyOtp);
route.post('/resend-otp', userSignup.resendOtp);

route.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
route.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        req.session.user = req.user._id.toString();
        res.redirect('/');
    }
);

route.get('/productDetails/:id', userController.loadProductDetails);

route.get('/login', userLogin.loadLogin);
route.post('/login', userLogin.login);
route.get('/logout', userLogin.logout);

route.get('/forget-password', forgetPassword);
route.post('/send-reset-link', sendResetLink);
route.get('/verify-reset-otp', loadVerifyResetOtp);
route.post('/verify-reset-otp', verifyResetOtp);
route.get('/new-password', newPassword);
route.post('/reset-password', resetPassword);
route.post('/resend-reset-otp', userController.resendResetOtp);

route.get('/profile', userProfile.loadProfile);
route.get('/profile/edit', userProfile.loadEditProfile);
route.post('/profile/update', userProfile.updateProfile);

route.get('/address', userProfile.loadAddress);
route.post('/address/add', userProfile.addAddress);
route.post('/address/edit', userProfile.editAddress);
route.get('/address/delete/:addressId', userProfile.deleteAddress);
route.get('/address/add', userProfile.loadAddAddress);
route.get('/address/edit/:addressId', userProfile.loadEditAddress);

route.get('/cart', cartController.loadCart);
route.post('/cart/add', cartController.addToCart);
route.post('/cart/update', cartController.updateCartQuantity);
route.post('/cart/remove', cartController.removeFromCart);

route.get('/checkout', checkOutController.loadCheckout);
route.post('/checkout/add-address', checkOutController.addAddress);
route.post('/checkout/edit-address/:id', checkOutController.editAddress);
route.post('/checkout/place-order', checkOutController.placeOrder);
route.post('/checkout/apply-coupon', checkOutController.applyCoupon);
route.post('/checkout/remove-coupon', checkOutController.removeCoupon);
route.get('/thank-you', checkOutController.loadThankyou);

route.get('/order', orderController.loadOrder);
route.get('/order/:orderId', orderController.loadOrderDetails);
route.post('/order/cancel', orderController.cancelOrder);
route.post('/order/cancel-item', orderController.cancelItem);
route.post('/order/return', orderController.requestReturn);
route.get('/order/invoice/:orderId', orderController.downloadInvoice);
route.post('/order/retry', orderController.retryOrder);
route.post('/order/verify-retry-payment', orderController.verifyRetryPayment);

route.get('/wallet', walletController.loadWallet);

route.post('/create-order', razorpayController.createOrder);
route.post('/verify-payment', razorpayController.verifyPayment);

route.get('/order-failure', checkOutController.failorder);

route.get('/wishlist', wishlistController.loadWishlist);
route.post('/wishlist/add', wishlistController.addToWishlist);
route.post('/wishlist/remove', wishlistController.removeFromWishlist);
route.post('/wishlist/move-to-cart', wishlistController.moveToCartFromWishlist);

route.get('/razorpay-key', (req, res) => {
    res.json({ key: process.env.RAZORPAY_KEY_ID });
});

module.exports = route;