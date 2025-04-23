const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const mongoose = require('mongoose');

const loadWallet = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const users = await User.find({ 'walletTransactions.0': { $exists: true } })
            .select('fullname email wallet walletTransactions')
            .lean();

        let transactions = [];
        users.forEach(user => {
            user.walletTransactions.forEach(transaction => {
                transactions.push({
                    _id: transaction._id,
                    userId: user._id,
                    userName: user.fullname || user.email,
                    transactionId: transaction._id,
                    date: transaction.createdAt,
                    type: transaction.amount > 0 ? 'Credit' : 'Debit',
                    amount: Math.abs(transaction.amount),
                    orderId: transaction.orderId
                });
            });
        });

        transactions = transactions
            .sort((a, b) => b.date - a.date)
            .slice(skip, skip + limit);

        const totalTransactions = transactions.length;
        const totalPages = Math.ceil(totalTransactions / limit);

        res.render('adminWallet', {
            transactions,
            page,
            totalPages,
            currentPage: 'wallet'
        });
    } catch (error) {
        console.error('Error loading admin wallet:', error);
        res.status(500).render('error', { message: 'Error loading wallet management' });
    }
};

const viewTransaction = async (req, res) => {
    try {
        const { transactionId, userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).render('error', { message: 'Invalid user ID' });
        }

        const user = await User.findById(userId)
            .select('fullname email phone addresses wallet walletTransactions')
            .lean();

        if (!user) {
            return res.status(404).render('error', { message: 'User not found' });
        }

        if (!Array.isArray(user.walletTransactions)) {
            return res.status(404).render('error', { message: 'No transactions found for this user' });
        }

        const transaction = user.walletTransactions.find(t => t._id.toString() === transactionId);
        if (!transaction) {
            return res.status(404).render('error', { message: 'Transaction not found' });
        }

        let order = null;
        if (transaction.orderId) {
            if (!mongoose.Types.ObjectId.isValid(transaction.orderId)) {
                console.warn(`Invalid orderId: ${transaction.orderId}`);
            } else {
                order = await Order.findById(transaction.orderId)
                    .select('orderNumber status totalAmount')
                    .lean();
            }
        }

        const transactionDetails = {
            user: {
                name: user.fullname || user.email,
                email: user.email,
                phone: user.phone || 'N/A',
                address: user.addresses && user.addresses.length > 0 
                    ? user.addresses.find(addr => addr.isDefault) || user.addresses[0]
                    : null
            },
            transaction: {
                id: transaction._id,
                date: transaction.createdAt,
                type: transaction.amount > 0 ? 'Credit' : 'Debit',
                amount: Math.abs(transaction.amount),
                description: transaction.description,
                source: transaction.orderId ? 'Order Related' : 'Manual Adjustment',
                order
            }
        };

        res.render('adminTransactionDetails', {
            transactionDetails,
            currentPage: 'wallet'
        });
    } catch (error) {
        console.error('Error loading transaction details:', error);
        res.status(500).render('error', { message: 'Error loading transaction details' });
    }
};

module.exports = { loadWallet, viewTransaction };