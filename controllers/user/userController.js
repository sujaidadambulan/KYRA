const User = require("../../models/userSchema");
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');

const loadHomepage = async (req, res) => {
    try {
        if (req.session.user) {
            const userData = await User.findById(req.session.user);
            return res.render('home', {currentPage : null , user: userData });
        }
        res.render('home', {currentPage : null , user: null });
    } catch (err) {
        console.log('Home page loading error:', err);
        res.status(500).send('Error loading homepage');
    }
};

const loadShop = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const search = req.query.search || '';
        const sort = req.query.sort || 'newest';
        const priceFilter = req.query.priceFilter || '';
        const categoryId = req.query.category || '';

        const categories = await Category.find({ status: true });
        if (!categories.length) {
            console.log('No active categories found');
        }

        let query = {
            isBlocked: false,
            'variants.stock': { $gt: 0 }
        };

        if (categoryId) {
            query.category = categoryId;
        } else {
            query.category = { $in: categories.map(category => category._id) };
        }

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        if (priceFilter) {
            const [min, max] = priceFilter.split('-');
            if (max) {
                query.offerPrice = { $gte: Number(min), $lte: Number(max) };
            } else {
                query.offerPrice = { $gte: Number(min) };
            }
        }

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        let sortOption = { createdAt: -1 };
        if (sort === 'price-low') sortOption = { offerPrice: 1 };
        if (sort === 'price-high') sortOption = { offerPrice: -1 };

        let productData = await Product.find(query)
            .populate('category')
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(limit);

        const productsWithPrices = await Promise.all(productData.map(async product => {
            if (product.offerPrice === 0 || product.isModified('offer') || product.isModified('variants') || product.isModified('category')) {
                await product.calculateOfferPrice();
            }

            const regularPrice = product.regularPrice || 0; 
            let effectiveOfferPrice = product.offerPrice;

            if (!effectiveOfferPrice) {
                const variantPrices = product.variants.map(v => v.offerPrice > 0 ? v.offerPrice : v.price);
                effectiveOfferPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : regularPrice;
            }

            const discount = regularPrice > effectiveOfferPrice 
                ? Math.round(((regularPrice - effectiveOfferPrice) / regularPrice) * 100) 
                : null;

            return {
                ...product.toObject(),
                regularPrice, 
                offerPrice: Number(effectiveOfferPrice.toFixed(2)),
                discount 
            };
        }));

        const userData = req.session.user ? await User.findById(req.session.user) : null;

        res.render('shop', { 
            user: userData,
            currentPage: 'Shop',
            products: productsWithPrices,
            currentPage: page,
            totalPages: totalPages,
            search: search,
            sort: sort,
            priceFilter: priceFilter,
            categoryId: categoryId,
            categories: categories 
        });
    } catch (err) {
        console.error('Shop page loading error:', err);
        res.status(500).render('error', { 
            message: 'Error loading shop page',
            user: req.session.user ? await User.findById(req.session.user) : null
        });
    }
};

const loadAbout = async(req,res)=>{
    const userData = await User.findById(req.session.user);
    try{
        return res.render('about',{ currentPage :'About' , user : userData})
    }catch(err){
        console.log('about page is not found');
        res.status(404).send('error')
    }
}

const errorPage = async (req, res) => {
    try {
        const statusCode = res.statusCode || 500; 
        const message = statusCode === 404 ? 'Not Found' : 'Internal Server Error';
        const userData = await User.findById(req.session.user);
        return res.render('error', { user: userData, message: message });  
    } catch (err) {
        console.error('Error inside errorPage:', err);
        res.status(500).send('Something went wrong.');
    }
}

const loadContact = async(req,res)=>{
    const userData = await User.findById(req.session.user);
    try{
        return res.render('contact',{currentPage:'Contact' , user : userData})
    }catch(err){
        console.log('about page is not found');
        res.status(404).send('error')
    }
}

const loadProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).render('error', { 
                message: 'Product not found',
                user: req.session.user ? await User.findById(req.session.user) : null
            });
        }

        const userData = req.session.user ? await User.findById(req.session.user).populate('wishlist') : null;

        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId }, 
            isListed: true,
            isBlocked: false
        })
            .limit(4) 
            .lean();

        res.render('productDetails', { 
            product: product.toObject(), 
            user: userData,
            relatedProducts,
            currentPage: 'product details'
        });
    } catch (err) {
        console.error('Error loading product details:', err);
        res.status(500).render('error', { 
            message: 'Error loading product details',
            user: req.session.user ? await User.findById(req.session.user) : null
        });
    }
};

const resendResetOtp = async (req, res) => {
    try {
        const { resetEmail } = req.session;
        if (!resetEmail) {
            return res.status(400).json({ success: false, message: 'Session expired' });
        }
        const otp = otpGenerate();
        req.session.resetOtp = otp;
        const emailSent = await sendEmailVerification(resetEmail, otp);
        if (emailSent) {
            console.log('Resent OTP:', otp);
            res.status(200).json({ success: true, message: 'OTP resent successfully' });
        } else {
            res.status(400).json({ success: false, message: 'Try again' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const serverError = async(req,res)=>{
    try {
        const statusCode = res.statusCode || 500; 
        const message = statusCode === 404 ? 'Not Found' : 'Internal Server Error';
        const userData = await User.findById(req.session.user);
        res.render('serverError',{user:userData,message:message})
    } catch (error) {
        console.log(error)
    }
}

module.exports ={
     loadHomepage,  errorPage , loadShop , loadAbout , loadContact  ,
        loadProductDetails ,resendResetOtp ,serverError
    };

