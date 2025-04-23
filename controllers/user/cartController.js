const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

const loadCart = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.render('cart', { currentPage: 'cart', user: null, cartItems: [] });
        }

        const user = await User.findById(req.session.user).populate({
            path: 'cart.product',
            populate: { path: 'category' }
        });

        if (!user) {
            return res.render('cart', { currentPage: 'cart', user: null, cartItems: [] });
        }

        const cartItems = user.cart.filter(item => 
            item.product && 
            item.product.isListed && 
            !item.product.isBlocked && 
            item.product.category && 
            item.product.category.status
        );

        res.render('cart', { currentPage: 'cart', user, cartItems });
    } catch (err) {
        console.error('Error in loadCart:', err);
        res.status(500).send('Server Error');
    }
};

const addToCart = async (req, res) => {
    try {
      const { productId, size, quantity = 1 } = req.body;
      const user = await User.findById(req.session.user);
      if (!user) {
        return res.json({ success: false, message: 'User not found' });
      }
  
      const product = await Product.findById(productId).populate('category');
      if (!product || !product.isListed || product.isBlocked || !product.category || !product.category.status) {
        return res.json({ success: false, message: 'Product unavailable' });
      }
  
      const variant = product.variants.find(v => v.size === size);
      if (!variant) {
        return res.json({ success: false, message: 'Size not available' });
      }
  
      const requestedQuantity = parseInt(quantity);
      if (requestedQuantity < 1 || requestedQuantity > 3) {
        return res.json({ success: false, message: 'Quantity must be between 1 and 3' });
      }
      if (variant.stock < requestedQuantity) {
        return res.json({ success: false, message: `Only ${variant.stock} items in stock` });
      }
  
      const existingVariantIndex = user.cart.findIndex(item => item.product.toString() === productId);
      if (existingVariantIndex > -1) {
        if (user.cart[existingVariantIndex].size !== size) {
          return res.json({ success: false, message: 'Only one variant per product allowed in cart' });
        }
        const newQuantity = user.cart[existingVariantIndex].quantity + requestedQuantity;
        if (newQuantity > 3) {
          return res.json({ success: false, message: 'Maximum 3 items allowed' });
        }
        if (newQuantity > variant.stock) {
          return res.json({ success: false, message: `Only ${variant.stock} items in stock` });
        }
        user.cart[existingVariantIndex].quantity = newQuantity;
      } else {
        user.cart.push({ 
          product: productId, 
          size, 
          quantity: requestedQuantity,
          price: variant.offerPrice
        });
      }
  
      await user.save();
      res.json({ success: true, message: 'Added to cart successfully' });
    } catch (err) {
      console.error('Error in addToCart:', err);
      res.json({ success: false, message: 'Error adding to cart' });
    }
  };

  const updateCartQuantity = async (req, res) => {
    try {
      const { productId, size, quantity } = req.body;
      const user = await User.findById(req.session.user);
      const product = await Product.findById(productId);
  
      const variant = product.variants.find(v => v.size === size);
      const cartItem = user.cart.find(item => 
        item.product.toString() === productId && item.size === size
      );
  
      if (!cartItem || !variant) {
        return res.json({ success: false, message: 'Item not found' });
      }
  
      const newQuantity = parseInt(quantity);
      if (newQuantity < 1 || newQuantity > 3) {
        return res.json({ success: false, message: 'Quantity must be between 1 and 3' });
      }
      if (newQuantity > variant.stock) {
        return res.json({ success: false, message: `Only ${variant.stock} items in stock` });
      }
  
      cartItem.quantity = newQuantity;
      cartItem.price = variant.offerPrice;
      await user.save();
      res.json({ 
        success: true, 
        newTotal: (cartItem.quantity * cartItem.price).toFixed(2), 
        quantity: cartItem.quantity
      });
    } catch (err) {
      console.error('Error in updateCartQuantity:', err);
      res.json({ success: false, message: 'Error updating quantity' });
    }
  };

const removeFromCart = async (req, res) => {
    try {
        const { productId, size } = req.body;
        const user = await User.findById(req.session.user);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        const initialCartLength = user.cart.length;
        user.cart = user.cart.filter(item => 
            !(item.product.toString() === productId && item.size === size)
        );

        if (user.cart.length === initialCartLength) {
            return res.json({ success: false, message: 'Item not found in cart' });
        }

        await user.save();
        res.json({ success: true, message: 'Item removed from cart' });
    } catch (err) {
        console.error('Error in removeFromCart:', err);
        res.json({ success: false, message: 'Error removing item' });
    }
};

module.exports = { loadCart, addToCart, updateCartQuantity, removeFromCart };

