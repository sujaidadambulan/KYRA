const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Order = require('../../models/orderSchema');
const { addWalletTransaction } = require('../user/walletController');

const loadAdminOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const sort = req.query.sort || '-createdAt';

        const query = search 
            ? { orderId: { $regex: search, $options: 'i' } }
            : {};

        const orders = await Order.find(query)
            .populate('user')
            .populate('items.product')
            .sort(sort)
            .skip(skip)
            .limit(limit);
        
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('order', { 
            orders, 
            currentPage: page, 
            totalPages, 
            search, 
            sort 
        });
    } catch (err) {
        console.error('Error loading admin orders:', err);
        res.status(500).send('Server Error');
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) {
            console.log('Order not found for orderId:', orderId);
            return res.json({ success: false, message: 'Order not found' });
        }

        order.status = status;
        await order.save();
        const product = await Product.findById(item.product);
        const variant = product.variants.find(v => v.size === item.size);
         variant.stock -= item.quantity;
        res.json({ success: true, message: 'Order status updated' });
    } catch (err) {
        console.error('Error updating status:', err.message, err.stack);
        res.json({ success: false, message: 'Error updating status' });
    }
};

const verifyReturnRequest = async (req, res) => {
    try {
        const { orderId, itemId, action, rejectMessage } = req.body;
        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        const item = order.items.id(itemId);
        if (!item) {
            return res.json({ success: false, message: 'Item not found' });
        }

        item.returnRequest.status = action === 'approve' ? 'Approved' : 'Rejected';
        if (action === 'reject' && rejectMessage) {
            item.returnRequest.rejectMessage = rejectMessage;
        }
        
        if (action === 'approve') {
            const user = await User.findById(order.user);
            const refundAmount = item.total;

            let refundDescription = `Refund for returned item in order ${order.orderId}`;
            if (order.paymentMethod === 'Wallet' || order.paymentMethod === 'Wallet + Razorpay') {
                const walletRefund = order.paymentMethod === 'Wallet' ? refundAmount : Math.min(order.walletAmount, refundAmount);
                if (walletRefund > 0) {
                    await addWalletTransaction(
                        user._id,
                        refundDescription,
                        walletRefund,
                        order._id
                    );
                }
            } else {
                await addWalletTransaction(
                    user._id,
                    refundDescription,
                    refundAmount,
                    order._id
                );
            }

            const product = await Product.findById(item.product);
            const variant = product.variants.find(v => v.size === item.size);
            variant.stock += item.quantity; 
            await Promise.all([user.save(), product.save()]);
        }
        
        await order.save();
        res.json({ success: true, message: `Return request ${action}d` });
    } catch (err) {
        console.error('Error verifying return:', err);
        res.json({ success: false, message: 'Error verifying return' });
    }
};

const loadOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findOne({ orderId })
            .populate('user')
            .populate('items.product');

        if (!order) {
            return res.status(404).send('Order not found');
        }

        res.render('adminOrderDetails', { order });
    } catch (err) {
        console.error('Error loading order details:', err);
        res.status(500).send('Server Error');
    }
};

module.exports = { loadAdminOrders, updateOrderStatus, verifyReturnRequest, loadOrderDetails };