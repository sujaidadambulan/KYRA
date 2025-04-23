const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const axios = require('axios');
const { addWalletTransaction } = require('./walletController');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5667';

const loadCheckout = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const user = await User.findById(req.session.user).populate({
            path: 'cart.product',
            populate: { path: 'category' }
        });

        if (!user || user.cart.length === 0) {
            return res.redirect('/cart');
        }

        const cartItems = user.cart.filter(item => 
            item.product && 
            item.product.isListed && 
            !item.product.isBlocked && 
            item.product.category && 
            item.product.category.status
        );

        if (user.addresses.length > 0 && !user.addresses.some(addr => addr.isDefault)) {
            user.addresses[0].isDefault = true;
            await user.save();
        }

        const now = new Date();
        const coupons = await Coupon.find({
            validFrom: { $lte: now },
            validTo: { $gte: now },
            $expr: { $lt: ['$uses', '$maxUses'] }, 
            maxUses: { $gt: 0 } 
        }).lean();

        const appliedCoupon = req.session.appliedCoupon || null;

        res.render('checkout', {
            user,
            cartItems,
            appliedCoupon,
            coupons, 
            currentPage: 'Checkout'
        });
    } catch (err) {
        console.error('Error loading checkout:', err);
        res.status(500).render('error', { message: 'Server Error' });
    }
};

const addAddress = async (req, res) => {
    try {
        const user = await User.findById(req.session.user);
        const {
            fullName, street, city, state, postalCode, country,
            primaryContact, alternativeContact, isDefault
        } = req.body;

        const newAddress = {
            fullName, street, city, state, postalCode, country,
            primaryContact, alternativeContact,
            isDefault: isDefault === 'on' || false
        };

        if (isDefault === 'on') {
            user.addresses.forEach(addr => addr.isDefault = false);
        }

        user.addresses.push(newAddress);
        await user.save();
        
        res.redirect('/checkout');
    } catch (err) {
        console.error('Error adding address:', err);
        res.json({ success: false, message: 'Error adding address' });
    }
};

const editAddress = async (req, res) => {
    try {
        const user = await User.findById(req.session.user);
        const addressId = req.params.id; 
        const {
            fullName, street, city, state, postalCode, country,
            primaryContact, alternativeContact, isDefault
        } = req.body;

        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.json({ success: false, message: 'Address not found' });
        }

        if (isDefault === 'on' || isDefault === true) {
            user.addresses.forEach(addr => addr.isDefault = false);
        }

        user.addresses[addressIndex] = {
            ...user.addresses[addressIndex],
            fullName,
            street,
            city,
            state,
            postalCode,
            country,
            primaryContact,
            alternativeContact: alternativeContact || user.addresses[addressIndex].alternativeContact,
            isDefault: isDefault === 'on' || isDefault === true
        };

        await user.save();
        return res.json({ success: true, message: 'Address updated successfully' });
    } catch (err) {
        console.error('Error editing address:', err);
        return res.json({ success: false, message: 'Error editing address' });
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const user = await User.findById(req.session.user).populate('cart.product');

        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        const cartItems = user.cart.filter(item => 
            item.product && item.product.isListed && !item.product.isBlocked
        );
        const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const coupon = await Coupon.findOne({ code: couponCode });
        if (!coupon) {
            return res.json({ success: false, message: 'Invalid coupon code' });
        }

        const now = new Date();
        if (now < coupon.validFrom || now > coupon.validTo) {
            return res.json({ success: false, message: 'Coupon is not valid at this time' });
        }
        if (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses) {
            return res.json({ success: false, message: 'Coupon has reached its maximum usage limit' });
        }
        if (subtotal < coupon.minPurchase) {
            return res.json({ success: false, message: `Minimum purchase of ₹${coupon.minPurchase} required` });
        }
        if (req.session.appliedCoupon) {
            return res.json({ success: false, message: 'A coupon is already applied' });
        }

        const discount = coupon.discountType === 'percentage'
            ? subtotal * (coupon.discountValue / 100)
            : coupon.discountValue;

        req.session.appliedCoupon = {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discountAmount: Math.min(discount, subtotal) 
        };

        res.json({ 
            success: true, 
            message: 'Coupon applied successfully',
            discountAmount: req.session.appliedCoupon.discountAmount
        });
    } catch (err) {
        console.error('Error applying coupon:', err);
        res.json({ success: false, message: 'Error applying coupon' });
    }
};

const removeCoupon = async (req, res) => {
    try {
        if (!req.session.appliedCoupon) {
            return res.json({ success: false, message: 'No coupon applied' });
        }
        req.session.appliedCoupon = null;
        res.json({ success: true, message: 'Coupon removed successfully' });
    } catch (err) {
        console.error('Error removing coupon:', err);
        res.json({ success: false, message: 'Error removing coupon' });
    }
};

const placeOrder = async (req, res) => {
    try {
        const user = await User.findById(req.session.user).populate({
            path: 'cart.product',
            populate: { path: 'category' }
        });

        const { addressId, paymentMethod } = req.body;

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const selectedAddress = user.addresses.find(addr => addr._id.toString() === addressId);
        if (!selectedAddress) {
            return res.status(400).json({ success: false, message: 'Please select a valid address' });
        }

        const cartItems = user.cart.filter(item =>
            item.product &&
            item.product.isListed &&
            !item.product.isBlocked &&
            item.product.category &&
            item.product.category.status
        );

        if (cartItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty or contains unavailable products' });
        }

        const orderItems = [];
        for (const item of cartItems) {
            const product = await Product.findById(item.product._id);
            const variant = product.variants.find(v => v.size === item.size);

            if (!variant || variant.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name} (Size: ${item.size})`
                });
            }

            const price = variant.offerPrice > 0 ? variant.offerPrice : variant.price;
            orderItems.push({
                product: item.product._id,
                size: item.size,
                quantity: item.quantity,
                price: price,
                regularPrice: item.product.regularPrice,
                total: price * item.quantity
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
            paymentMethod,
            subtotal,
            shipping,
            total,
            couponDiscount,
            walletAmount: 0,
            status: 'Pending'
        });

        if (paymentMethod === 'Wallet') {
            if (user.wallet >= total) {
                order.walletAmount = total;
                await addWalletTransaction(
                    user._id,
                    `Payment for order ${order.orderId} via wallet`,
                    -total,
                    order._id.toString()
                );
            } else {
                const walletAmountUsed = user.wallet;
                const remainingAmount = total - walletAmountUsed;

                const response = await axios.post(`${BASE_URL}/create-order`, {
                    amount: remainingAmount * 100
                }, {
                    headers: { 'Content-Type': 'application/json' }
                });

                const razorpayOrder = response.data;
                order.paymentMethod = 'Wallet + Razorpay';
                order.walletAmount = walletAmountUsed;

                await addWalletTransaction(
                    user._id,
                    `Payment for order ${order.orderId} via wallet`,
                    -walletAmountUsed,
                    order._id.toString()
                );

                return res.json({
                    success: false,
                    message: 'Insufficient wallet balance, proceeding with Razorpay for remaining amount',
                    razorpayOrder,
                    addressId,
                    walletAmount: walletAmountUsed
                });
            }
        } else if (paymentMethod === 'Razorpay') {
            const response = await axios.post(`${BASE_URL}/create-order`, {
                amount: total * 100
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            const razorpayOrder = response.data;
            return res.json({
                success: false,
                message: 'Proceed with Razorpay payment',
                razorpayOrder,
                addressId
            });
        } else if (paymentMethod === 'COD') {
            if (total > 3000) {
                return res.status(400).json({
                    success: false,
                    message: 'Cash on Delivery is not available for orders above ₹3000'
                });
            }
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment method'
            });
        }

        try {
            await order.validate();
        } catch (validationError) {
            console.error('Order validation error:', validationError);
            order.status = 'Failed';
            order.failureReason = validationError.message;
            await order.save();

            user.orderHistory.push(order._id);
            await user.save();

            return res.status(400).json({
                success: false,
                message: 'Order validation failed',
                orderId: order._id
            });
        }

        await order.save();
        user.cart = [];
        user.orderHistory.push(order._id);
        await user.save();

        res.json({ success: true, orderId: order._id });
    } catch (err) {
        console.error('Error placing order:', err);

        const failedOrder = new Order({
            user: req.session.user,
            orderId: 'ORD-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            status: 'Failed',
            failureReason: err.message,
            paymentMethod: req.body.paymentMethod || 'Unknown',
            createdAt: new Date(),
            subtotal: 0,
            total: 0
        });

        await failedOrder.save();

        const user = await User.findById(req.session.user);
        if (user) {
            user.orderHistory.push(failedOrder._id);
            await user.save();
        }

        res.status(500).json({
            success: false,
            message: 'Error placing order',
            orderId: failedOrder._id
        });
    }
};

const loadThankyou = async (req, res) => {
    try {                                     
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const orderId = req.query.orderId;
        let query = { user: req.session.user };
        
        if (orderId) {
            query._id = orderId;
        }

        const lastOrder = await Order.findOne(query)
            .sort({ createdAt: -1 })
            .populate('items.product');

        if (!lastOrder) {
            return res.redirect('/cart'); 
        }

        res.render('thankyou', {
            order: lastOrder,
            user: req.session.user,
            currentPage: 'thankyou'
        });
    } catch (err) {
        console.error('Error loading thank you page:', err);
        res.status(500).render('error', { message: 'Something went wrong. Please try again.' });
    }
};

const failorder = async (req, res) => {
    try {                                     
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const orderId = req.query.orderId;
        let query = { user: req.session.user };
        
        if (orderId) {
            query._id = orderId;
        }

        const lastOrder = await Order.findOne(query)
            .sort({ createdAt: -1 })
            .populate('items.product');
        const user =  await User.findById(req.session.user)
        res.render('order-failure', {
            order: lastOrder || { _id: orderId || 'Unknown' },
            user: user,
            currentPage: 'order-failure'
        });
    } catch (err) {
        console.error('Error loading order failure page:', err);
        res.status(500).render('error', { message: 'Something went wrong. Please try again.' });
    }
};

module.exports = { 
    loadCheckout, 
    addAddress, 
    editAddress, 
    placeOrder, 
    loadThankyou, 
    failorder,
    applyCoupon,
    removeCoupon
};