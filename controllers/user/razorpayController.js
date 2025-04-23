const Razorpay = require('razorpay');
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const crypto = require('crypto');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const createOrder = async (req, res) => {
    try {
        const { amount } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const options = {
            amount: amount,
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
            payment_capture: 1,
        };

        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ error: 'Failed to create order', details: error.message });
    }
};

const verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            addressId,
            walletAmount
        } = req.body;

        // Verify Razorpay signature
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return res.json({ success: false, message: 'Invalid payment signature' });
        }

        // Find the user
        const user = await User.findById(req.session.user).populate({
            path: 'cart.product',
            populate: { path: 'category' }
        });

        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        const selectedAddress = user.addresses.find(addr => addr._id.toString() === addressId);
        if (!selectedAddress) {
            return res.json({ success: false, message: 'Invalid address' });
        }

        const cartItems = user.cart.filter(item =>
            item.product &&
            item.product.isListed &&
            !item.product.isBlocked &&
            item.product.category &&
            item.product.category.status
        );

        if (cartItems.length === 0) {
            return res.json({ success: false, message: 'Cart is empty or contains unavailable products' });
        }

        const orderItems = [];
        for (const item of cartItems) {
            const product = await Product.findById(item.product._id);
            const variant = product.variants.find(v => v.size === item.size);

            if (!variant || variant.stock < item.quantity) {
                return res.json({
                    success: false,
                    message: `Insufficient stock for ${product.name} (Size: ${item.size})`
                });
            }

            orderItems.push({
                product: item.product._id,
                size: item.size,
                quantity: item.quantity,
                price: variant.offerPrice > 0 ? variant.offerPrice : variant.price,
                regularPrice: item.product.regularPrice,
                total: (variant.offerPrice > 0 ? variant.offerPrice : variant.price) * item.quantity
            });

            variant.stock -= item.quantity;
            await product.save();
        }

        const subtotal = orderItems.reduce((sum, item) => sum + item.total, 0);
        const shipping = 50;
        let total = subtotal + shipping;
        let couponDiscount = 0;

        if (req.session.appliedCoupon) {
            const coupon = await Coupon.findOne({ code: req.session.appliedCoupon.code });
            if (coupon) {
                couponDiscount = req.session.appliedCoupon.discountAmount;
                total -= couponDiscount;
                coupon.uses += 1;
                await coupon.save();
            }
            req.session.appliedCoupon = null;
        }

        const order = new Order({
            user: user._id,
            orderId: 'ORD-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            items: orderItems,
            shippingAddress: selectedAddress,
            paymentMethod: walletAmount > 0 ? 'Wallet + Razorpay' : 'Razorpay',
            subtotal,
            shipping,
            total,
            couponDiscount,
            walletAmount: walletAmount || 0,
            status: 'Pending'
        });

        await order.validate();
        await order.save();

        user.cart = [];
        user.orderHistory.push(order._id);
        await user.save();

        res.json({ success: true, orderId: order._id });
    } catch (err) {
        console.error('Error verifying payment:', err);

        const failedOrder = new Order({
            user: req.session.user,
            orderId: 'ORD-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            status: 'Failed',
            failureReason: err.message,
            paymentMethod: 'Razorpay',
            createdAt: new Date()
        });

        await failedOrder.save();

        const user = await User.findById(req.session.user);
        if (user) {
            user.orderHistory.push(failedOrder._id);
            await user.save();
        }

        res.json({
            success: false,
            message: 'Error verifying payment',
            orderId: failedOrder._id
        });
    }
};

module.exports = { createOrder, verifyPayment };