const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const axios = require('axios');
const crypto = require('crypto');
const { addWalletTransaction } = require('./walletController');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5667';

const loadOrder = async (req, res) => {
    try {
        const user = await User.findById(req.session.user).populate('orderHistory');
        if (!user) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        const query = { 
            _id: { $in: user.orderHistory },
            status: { $in: ['Pending', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Failed'] },
            ...(search && { orderId: { $regex: search, $options: 'i' } })
        };

        const orders = await Order.find(query)
            .populate('items.product')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        console.log('Orders fetched:', orders.map(o => ({ orderId: o.orderId, status: o.status, failureReason: o.failureReason })));
        
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        res.set('Cache-Control', 'no-store');
        res.render('orderPage', { 
            user, 
            orders, 
            currentPage: 'order', 
            page, 
            totalPages, 
            search 
        });
    } catch (err) {
        console.error('Error loading orders:', err);
        res.status(404).send('Error');
    }
};

const loadOrderDetails = async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId })
            .populate('items.product');
        if (!order) throw new Error('Order not found');
        res.render('orderDetails', { user: req.session.user, order, currentPage: 'order details' });
    } catch (err) {
        console.error('Error loading order details:', err);
        res.status(404).send('Error');
    }
};

const cancelOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.body.orderId }).populate('items.product');
        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }
        if (order.status === 'Delivered') {
            return res.json({ success: false, message: 'Cannot cancel delivered order' });
        }
        
        let refundAmount = 0;
        for (let item of order.items) {
            if (!item.isCancelled) {
                item.isCancelled = true;
                refundAmount += item.total;
                const product = item.product;
                const variant = product.variants.find(v => v.size === item.size);
                variant.stock += item.quantity; 
                await product.save();
            }
        }

        order.status = 'Cancelled';
        await order.save();

        if (refundAmount > 0) {
            let refundDescription = `Refund for cancelled order ${order.orderId}`;
            if (order.paymentMethod === 'Wallet' || order.paymentMethod === 'Wallet + Razorpay') {
                const walletRefund = order.paymentMethod === 'Wallet' ? refundAmount : Math.min(order.walletAmount, refundAmount);
                if (walletRefund > 0) {
                    await addWalletTransaction(
                        order.user,
                        refundDescription,
                        walletRefund,
                        order._id
                    );
                }
            } else if (order.paymentMethod === 'Razorpay') {
                await addWalletTransaction(
                    order.user,
                    refundDescription,
                    refundAmount,
                    order._id
                );
            }
        }

        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (err) {
        console.error('Error cancelling order:', err);
        res.json({ success: false, message: 'Error cancelling order' });
    }
};

const cancelItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.body;
        const order = await Order.findOne({ orderId }).populate('items.product');
        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }
        if (order.status === 'Delivered') {
            return res.json({ success: false, message: 'Cannot cancel item from delivered order' });
        }
        
        const item = order.items.id(itemId);
        if (!item || item.isCancelled) {
            return res.json({ success: false, message: 'Item not found or already cancelled' });
        }

        item.isCancelled = true;
        const refundAmount = item.total;
        const product = item.product;
        const variant = product.variants.find(v => v.size === item.size);
        variant.stock += item.quantity; 
        await product.save();
        await order.save();

        if (refundAmount > 0) {
            let refundDescription = `Refund for cancelled item in order ${order.orderId}`;
            if (order.paymentMethod === 'Wallet' || order.paymentMethod === 'Wallet + Razorpay') {
                const walletRefund = order.paymentMethod === 'Wallet' ? refundAmount : Math.min(order.walletAmount, refundAmount);
                if (walletRefund > 0) {
                    await addWalletTransaction(
                        order.user,
                        refundDescription,
                        walletRefund,
                        order._id
                    );
                }
            } else if (order.paymentMethod === 'Razorpay') {
                await addWalletTransaction(
                    order.user,
                    refundDescription,
                    refundAmount,
                    order._id
                );
            }
        }

        res.json({ success: true, message: 'Item cancelled successfully' });
    } catch (err) {
        console.error('Error cancelling item:', err);
        res.json({ success: false, message: 'Error cancelling item' });
    }
};

const requestReturn = async (req, res) => {
    try {
        const { orderId, itemId, reason } = req.body;
        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }
        if (order.status !== 'Delivered') {
            return res.json({ success: false, message: 'Can only return delivered items' });
        }
        
        const item = order.items.id(itemId);
        if (!item || item.returnRequest.requested) {
            return res.json({ success: false, message: 'Item not found or return already requested' });
        }

        item.returnRequest.requested = true;
        item.returnRequest.reason = reason;
        await order.save();
        res.json({ success: true, message: 'Return request submitted' });
    } catch (err) {
        console.error('Error requesting return:', err);
        res.json({ success: false, message: 'Error requesting return' });
    }
};

const downloadInvoice = async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId })
            .populate('items.product');
        
        const doc = new PDFDocument();
        res.setHeader('Content-disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
        res.setHeader('Content-type', 'application/pdf');
        
        doc.pipe(res);
        doc.fontSize(25).text('Invoice', { align: 'center' });
        doc.fontSize(12).text(`Order ID: ${order.orderId}`);
        doc.text(`Date: ${order.createdAt.toLocaleDateString()}`);
        doc.moveDown();
        
        order.items.forEach(item => {
            doc.text(`${item.product.name} (${item.size}) x ${item.quantity} - ₹${item.total}`);
        });
        doc.moveDown();
        doc.text(`Subtotal: ₹${order.subtotal}`);
        doc.text(`Shipping: ₹${order.shipping}`);
        doc.text(`Total: ₹${order.total}`, { align: 'right' });
        
        doc.end();
    } catch (err) {
        console.error('Error generating invoice:', err);
        res.status(500).send('Error generating invoice');
    }
};

const retryOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const user = await User.findById(req.session.user).populate({
            path: 'cart.product',
            populate: { path: 'category' }
        });

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const failedOrder = await Order.findOne({ orderId, user: user._id, status: 'Failed' });
        if (!failedOrder) {
            return res.status(400).json({ success: false, message: 'Failed order not found or not eligible for retry' });
        }

        // Restore cart items from failed order
        user.cart = failedOrder.items.map(item => ({
            product: item.product,
            size: item.size,
            quantity: item.quantity,
            price: item.price
        }));

        // Validate stock for all items
        for (const item of user.cart) {
            const product = await Product.findById(item.product._id);
            const variant = product.variants.find(v => v.size === item.size);

            if (!variant || variant.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name} (Size: ${item.size})`
                });
            }
        }

        const addressId = failedOrder.shippingAddress._id || user.addresses.find(addr => addr.isDefault)?._id;
        if (!addressId) {
            return res.status(400).json({ success: false, message: 'No valid address found' });
        }

        const selectedAddress = user.addresses.find(addr => addr._id.toString() === addressId.toString());
        if (!selectedAddress) {
            return res.status(400).json({ success: false, message: 'Please select a valid address' });
        }

        const paymentMethod = failedOrder.paymentMethod;
        const subtotal = failedOrder.subtotal;
        const shipping = failedOrder.shipping;
        let total = failedOrder.total;
        let couponDiscount = failedOrder.couponDiscount;

        // Reapply coupon if it was used
        if (couponDiscount > 0 && req.session.appliedCoupon) {
            const coupon = await Coupon.findOne({ code: req.session.appliedCoupon.code });
            if (coupon && coupon.uses < coupon.maxUses && new Date() >= coupon.validFrom && new Date() <= coupon.validTo) {
                coupon.uses += 1;
                await coupon.save();
            } else {
                couponDiscount = 0;
                total = subtotal + shipping;
                req.session.appliedCoupon = null;
            }
        }

        const orderItems = failedOrder.items.map(item => ({
            product: item.product,
            size: item.size,
            quantity: item.quantity,
            price: item.price,
            regularPrice: item.regularPrice,
            total: item.total
        }));

        // Update stock
        for (const item of orderItems) {
            const product = await Product.findById(item.product);
            const variant = product.variants.find(v => v.size === item.size);
            variant.stock -= item.quantity;
            await product.save();
        }

        const newOrder = new Order({
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
                newOrder.walletAmount = total;
                await addWalletTransaction(
                    user._id,
                    `Payment for order ${newOrder.orderId} via wallet`,
                    -total,
                    newOrder._id.toString()
                );
                await newOrder.save();
                user.cart = [];
                user.orderHistory.push(newOrder._id);
                await user.save();
                return res.json({ success: true, orderId: newOrder._id, message: 'Order placed successfully' });
            } else {
                const walletAmountUsed = user.wallet;
                const remainingAmount = total - walletAmountUsed;

                const response = await axios.post(`${BASE_URL}/create-order`, {
                    amount: remainingAmount * 100
                }, {
                    headers: { 'Content-Type': 'application/json' }
                });

                const razorpayOrder = response.data;
                newOrder.paymentMethod = 'Wallet + Razorpay';
                newOrder.walletAmount = walletAmountUsed;

                await addWalletTransaction(
                    user._id,
                    `Payment for order ${newOrder.orderId} via wallet`,
                    -walletAmountUsed,
                    newOrder._id.toString()
                );

                await newOrder.save();
                user.orderHistory.push(newOrder._id);
                await user.save();

                return res.json({
                    success: false,
                    message: 'Insufficient wallet balance, proceeding with Razorpay for remaining amount',
                    razorpayOrder,
                    addressId,
                    walletAmount: walletAmountUsed,
                    orderId: newOrder._id
                });
            }
        } else if (paymentMethod === 'Razorpay' || paymentMethod === 'Wallet + Razorpay') {
            const response = await axios.post(`${BASE_URL}/create-order`, {
                amount: total * 100
            }, {
                headers: { 'Content-Type': 'application/json' }
                });

            const razorpayOrder = response.data;
            await newOrder.save();
            user.orderHistory.push(newOrder._id);
            await user.save();

            return res.json({
                success: false,
                message: 'Proceed with Razorpay payment',
                razorpayOrder,
                addressId,
                orderId: newOrder._id
            });
        } else if (paymentMethod === 'COD') {
            if (total > 3000) {
                return res.status(400).json({
                    success: false,
                    message: 'Cash on Delivery is not available for orders above ₹3000'
                });
            }
            await newOrder.save();
            user.cart = [];
            user.orderHistory.push(newOrder._id);
            await user.save();
            return res.json({ success: true, orderId: newOrder._id, message: 'Order placed successfully' });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment method'
            });
        }
    } catch (err) {
        console.error('Error retrying order:', err);

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
            message: 'Error retrying order',
            orderId: failedOrder._id
        });
    }
};

const verifyRetryPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId,
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

        // Find the order
        const order = await Order.findOne({ orderId, user: req.session.user });
        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        // Update order status
        order.status = 'Pending';
        order.walletAmount = walletAmount || 0;
        await order.validate();
        await order.save();

        // Clear cart
        const user = await User.findById(req.session.user);
        user.cart = [];
        await user.save();

        res.json({ success: true, orderId: order._id });
    } catch (err) {
        console.error('Error verifying retry payment:', err);

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
            message: 'Error verifying retry payment',
            orderId: failedOrder._id
        });
    }
};

module.exports = { 
    loadOrder,
    loadOrderDetails,
    cancelOrder,
    cancelItem,
    requestReturn,
    downloadInvoice,
    retryOrder,
    verifyRetryPayment
};