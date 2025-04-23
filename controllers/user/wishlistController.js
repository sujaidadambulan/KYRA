const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Order = require('../../models/orderSchema');

const loadWishlist = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const userData = await User.findById(req.session.user).populate('wishlist');
        if (!userData) {
            return res.redirect('/login');
        }

        const wishlistItems = userData.wishlist.filter(product => 
            product && 
            product.isListed && 
            !product.isBlocked && 
            typeof product.offerPrice === 'number'
        );

        res.render('wishlist', { 
            user: userData, 
            wishlistItems, 
            currentPage: 'wishlist' 
        });
    } catch (err) {
        console.error('Error loading wishlist:', err);
        res.status(500).render('error', { message: 'Server Error' });
    }
};

const addToWishlist = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: 'Please log in to add to wishlist' });
        }

        const { productId } = req.body;
        const user = await User.findById(req.session.user);
        const product = await Product.findById(productId);

        if (!product || !product.isListed || product.isBlocked) {
            return res.json({ success: false, message: 'Product not available' });
        }

        if (!user.wishlist.includes(productId)) {
            user.wishlist.push(productId);
            await user.save();
            console.log('Updated Wishlist:', user.wishlist);
            return res.json({ success: true, message: 'Added to wishlist' });
        }

        res.json({ success: false, message: 'Product already in wishlist' });
    } catch (err) {
        console.error('Error adding to wishlist:', err);
        res.json({ success: false, message: 'Server Error' });
    }
};
const removeFromWishlist = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: 'Please log in' });
        }

        const { productId } = req.body;
        const user = await User.findById(req.session.user);

        const index = user.wishlist.indexOf(productId);
        if (index > -1) {
            user.wishlist.splice(index, 1);
            await user.save();
            return res.json({ success: true, message: 'Removed from wishlist' });
        }

        res.json({ success: false, message: 'Product not in wishlist' });
    } catch (err) {
        console.error('Error removing from wishlist:', err);
        res.json({ success: false, message: 'Server Error' });
    }
};

const moveToCartFromWishlist = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: 'Please log in' });
        }

        const { productId, size } = req.body;
        const user = await User.findById(req.session.user);
        const product = await Product.findById(productId);

        if (!product || !product.isListed || product.isBlocked) {
            return res.json({ success: false, message: 'Product not available' });
        }

        const variant = product.variants.find(v => v.size === size);
        if (!variant || variant.stock < 1) {
            return res.json({ success: false, message: 'Size not available or out of stock' });
        }

        const cartItem = user.cart.find(item => 
            item.product.toString() === productId && item.size === size
        );

        const price = variant.offerPrice > 0 ? variant.offerPrice : variant.price;

        if (!cartItem) {
            user.cart.push({
                product: productId,
                size,
                quantity: 1,
                price: price
            });
        } else {
            if (variant.stock > cartItem.quantity) {
                cartItem.quantity += 1;
            } else {
                return res.json({ success: false, message: 'Stock limit reached' });
            }
        }

        const wishlistIndex = user.wishlist.indexOf(productId);
        if (wishlistIndex > -1) {
            user.wishlist.splice(wishlistIndex, 1);
        } else {
            console.log(`Product ${productId} not found in wishlist during move to cart`);
        }

        await user.save();
        res.json({ success: true, message: 'Moved to cart and removed from wishlist' });
    } catch (err) {
        console.error('Error moving to cart from wishlist:', err);
        res.json({ success: false, message: 'Server Error' });
    }
};

module.exports = { 
    loadWishlist, 
    addToWishlist, 
    removeFromWishlist, 
    moveToCartFromWishlist 
};

