const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const { addWalletTransaction } = require('../user/walletController');

const loadCoupon = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const categoryFilter = req.query.category || ''; 

        let query = {};
        if (search) {
            query.code = { $regex: search, $options: 'i' };
        }
        if (categoryFilter) {
            query.discountType = categoryFilter; 
        }

        const coupons = await Coupon.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCoupons = await Coupon.countDocuments(query);
        const totalPages = Math.ceil(totalCoupons / limit);

        res.render('coupon', {
            coupons,
            currentPage: page,
            totalPages,
            search,
            categoryFilter,
            totalCoupons
        });
    } catch (error) {
        console.log('Load coupon page error:', error);
        res.status(500).send('Server Error');
    }
};

const createCoupon = async (req, res) => {
    try {
        const {
            code, discountType, discountValue, minPurchase, maxUses,
            validFrom, validTo, description
        } = req.body;

        if (!code || !discountType || !discountValue || !validFrom || !validTo) {
            return res.json({ success: false, message: 'All required fields must be filled' });
        }
        if (discountValue <= 0) {
            return res.json({ success: false, message: 'Discount value must be positive' });
        }
        if (new Date(validFrom) >= new Date(validTo)) {
            return res.json({ success: false, message: 'Valid From must be before Valid To' });
        }
        if (minPurchase < 0 || maxUses < 0) {
            return res.json({ success: false, message: 'Minimum purchase and max uses cannot be negative' });
        }

        const existingCoupon = await Coupon.findOne({ code });
        if (existingCoupon) {
            return res.json({ success: false, message: 'Coupon code already exists' });
        }

        const coupon = new Coupon({
            code,
            discountType,
            discountValue,
            minPurchase: minPurchase || 0,
            maxUses: maxUses || 0,
            validFrom,
            validTo,
            description
        });

        await coupon.save();
        res.json({ success: true, message: 'Coupon created successfully' });
    } catch (error) {
        console.error('Error creating coupon:', error);
        res.json({ success: false, message: 'Error creating coupon' });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const { couponId } = req.params;
        const coupon = await Coupon.findByIdAndDelete(couponId);
        if (!coupon) {
            return res.json({ success: false, message: 'Coupon not found' });
        }
        res.json({ success: true, message: 'Coupon deleted successfully' });
    } catch (error) {
        console.error('Error deleting coupon:', error);
        res.json({ success: false, message: 'Error deleting coupon' });
    }
};

const getCoupon = async (req, res) => {
    try {
        const { couponId } = req.params;
        const coupon = await Coupon.findById(couponId).lean();
        if (!coupon) {
            return res.json({ success: false, message: 'Coupon not found' });
        }
        res.json({ success: true, data: coupon });
    } catch (error) {
        console.error('Error fetching coupon:', error);
        res.json({ success: false, message: 'Error fetching coupon' });
    }
};

const updateCoupon = async (req, res) => {
    try {
        const { couponId, code, discountType, discountValue, minPurchase, maxUses, validFrom, validTo, description } = req.body;

        if (!couponId) {
            return res.json({ success: false, message: 'Coupon ID is required' });
        }
        if (!code || !discountType || !discountValue || !validFrom || !validTo) {
            return res.json({ success: false, message: 'All required fields must be filled' });
        }
        if (discountValue <= 0) {
            return res.json({ success: false, message: 'Discount value must be positive' });
        }
        if (new Date(validFrom) >= new Date(validTo)) {
            return res.json({ success: false, message: 'Valid From must be before Valid To' });
        }
        if (minPurchase < 0 || maxUses < 0) {
            return res.json({ success: false, message: 'Minimum purchase and max uses cannot be negative' });
        }

        const existingCoupon = await Coupon.findOne({ code, _id: { $ne: couponId } });
        if (existingCoupon) {
            return res.json({ success: false, message: 'Coupon code already exists' });
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(
            couponId,
            {
                code,
                discountType,
                discountValue,
                minPurchase: minPurchase || 0,
                maxUses: maxUses || 0,
                validFrom,
                validTo,
                description
            },
            { new: true }
        );

        if (!updatedCoupon) {
            return res.json({ success: false, message: 'Coupon not found' });
        }

        res.json({ success: true, message: 'Coupon updated successfully' });
    } catch (error) {
        console.error('Error updating coupon:', error);
        res.json({ success: false, message: 'Error updating coupon' });
    }
};

module.exports = {
    loadCoupon,
    createCoupon,
    deleteCoupon,
    getCoupon,
    updateCoupon
};