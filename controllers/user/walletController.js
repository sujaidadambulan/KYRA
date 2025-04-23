const User = require('../../models/userSchema');

const loadWallet = async (req, res) => {
    try {
        const user = await User.findById(req.session.user);
        if (!user) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const transactions = user.walletTransactions
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(skip, skip + limit);

        const totalTransactions = user.walletTransactions.length;
        const totalPages = Math.ceil(totalTransactions / limit);

        res.render('wallet', {
            user,
            transactions,
            currentPage: 'wallet',
            page,
            totalPages
        });
    } catch (err) {
        console.error('Error loading wallet page:', err);
        res.status(500).render('error', { message: 'Error loading wallet' });
    }
};

const addWalletTransaction = async (userId, description, amount, orderId = null) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Validate wallet balance
        if (user.wallet + amount < 0) {
            throw new Error('Insufficient wallet balance');
        }

        // Update wallet and add transaction
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $inc: { wallet: amount },
                $push: {
                    walletTransactions: {
                        description,
                        amount,
                        orderId: orderId ? String(orderId) : null,
                        createdAt: new Date()
                    }
                }
            },
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            throw new Error('Failed to update wallet');
        }

        return updatedUser;
    } catch (err) {
        console.error('Error adding wallet transaction:', err);
        throw err;
    }
};

module.exports = { loadWallet, addWalletTransaction };