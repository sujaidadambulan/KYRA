const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const fs = require('fs');
const path = require('path');
const { ensureDirectoryExists, saveBase64Image } = require('../../utils/fileUtils');

const getProductAddPage = async (req, res) => {
    try {
        const categories = await Category.find({ status: true });
        res.render('addProduct', { cat: categories });
    } catch (err) {
        console.error('Error loading add product page:', err);
        res.redirect('/error');
    }
};

const addProduct = async (req, res) => {
    try {
        const { productName, description, regularPrice, offer, category, sizes, prices, quantities, croppedImages, displayLocation } = req.body;

        if (!productName || !description || !regularPrice || !category) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const productExist = await Product.findOne({ name: productName });
        if (productExist) {
            return res.status(400).json({ error: 'Product already exists, please try another name' });
        }

        const categoryObj = await Category.findOne({ name: category });
        if (!categoryObj) {
            return res.status(400).json({ error: 'Invalid category name' });
        }

        const sizeArray = Array.isArray(sizes) ? sizes : (sizes ? [sizes] : []);
        const priceArray = Array.isArray(prices) ? prices : (prices ? [prices] : []);
        const quantityArray = Array.isArray(quantities) ? quantities : (quantities ? [quantities] : []);

        const variants = sizeArray.map((size, i) => {
            const price = parseFloat(priceArray[i]);
            const stock = parseInt(quantityArray[i]) || 0;
            return {
                size: size || '',
                price: isNaN(price) ? 0 : price,
                stock: isNaN(stock) ? 0 : stock
            };
        }).filter(v => v.size && v.price > 0 && v.stock >= 0);

        if (variants.length === 0) {
            return res.status(400).json({ error: 'At least one valid size variant with price and stock is required' });
        }

        let images = [];
        if (Array.isArray(croppedImages)) {
            const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'product-images');
            ensureDirectoryExists(uploadDir);
            for (let i = 0; i < croppedImages.length; i++) {
                if (croppedImages[i]) {
                    const filename = `product-${Date.now()}-${i}.jpg`;
                    const imagePath = path.join(uploadDir, filename);
                    saveBase64Image(croppedImages[i], imagePath);
                    images.push(filename);
                }
            }
        }

        const productOffer = offer ? parseFloat(offer) : 0;

        const product = new Product({
            name: productName,
            description,
            category: categoryObj._id,
            regularPrice: parseFloat(regularPrice),
            variants,
            displayLocation: displayLocation || 'none',
            images,
            isBlocked: false,
            offer: productOffer,
            offerPrice: 0
        });

        await product.calculateOfferPrice();
        await product.save();

        return res.status(200).json({ message: 'Product added successfully!', redirect: '/admin/products' });
    } catch (err) {
        console.error('Error saving product:', err);
        return res.status(500).json({ error: 'An error occurred while adding the product' });
    }
};

const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 4;

        const productData = await Product.find({
            $or: [{ name: { $regex: new RegExp(".*" + search + ".*", "i") } }]
        })
            .limit(limit)
            .skip((page - 1) * limit)
            .populate('category')
            .exec();

        const count = await Product.countDocuments({
            $or: [{ name: { $regex: new RegExp(".*" + search + ".*", "i") } }]
        });

        const categories = await Category.find({ status: true });

        const productsWithPrices = await Promise.all(productData.map(async (product) => {
            const { offerPrice, discountSource } = await product.calculateOfferPrice();
            const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);

            return {
                ...product.toObject(),
                finalPrice: offerPrice || (product.variants[0]?.price || 0), 
                maxDiscount: product.offer || (product.category.offer && product.category.offer.discount_percentage ? parseFloat(product.category.offer.discount_percentage.toString()) : 0),
                discountSource: discountSource || 'None',
                totalStock,
                stockStatus: totalStock > 0 ? 'In Stock' : 'Out of Stock'
            };
        }));

        res.render('products', {
            data: productsWithPrices,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            cat: categories,
            search
        });
    } catch (err) {
        console.error('Error fetching products:', err);
        res.redirect('/error');
    }
};

const updateOffer = async (req, res) => {
    try {
        const { productId, offer } = req.body;

        if (!productId || isNaN(offer) || offer < 0 || offer > 100) {
            return res.status(400).json({ success: false, message: "Invalid offer value" });
        }

        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        product.offer = parseFloat(offer);
        await product.calculateOfferPrice();
        await product.save();

        const discountSource = (product.category && product.category.offer && parseFloat(product.category.offer.discount_percentage.toString()) > product.offer && new Date(product.category.offer.valid_until) > new Date()) 
            ? 'Category' 
            : 'Product';

        res.json({ 
            success: true, 
            message: "Offer updated successfully", 
            offerPrice: product.offerPrice,
            discountSource
        });
    } catch (error) {
        console.error('Error in updateOffer:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const blockUnblockProduct = async (req, res) => {
    try {
        const { productId, action } = req.body;

        if (!productId || !["block", "unblock"].includes(action)) {
            return res.status(400).json({ success: false, message: "Invalid action" });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        product.isBlocked = action === "block";
        await product.save();

        res.json({
            success: true,
            message: `Product ${action}ed successfully`,
            isBlocked: product.isBlocked
        });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const editLoad = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category').lean();
        const categories = await Category.find({ status: true }).lean();

        if (!product) return res.redirect('/admin/products');

        res.render('update-product', { product, cat: categories });
    } catch (error) {
        console.error("Error fetching product details:", error);
        res.redirect('/admin/products');
    }
};

const updateProduct = async (req, res) => {
    try {
        const { productId, productName, description, regularPrice, offer, category, sizes, prices, quantities, existingImages, croppedImages, displayLocation } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const categoryObj = await Category.findOne({ name: category });
        if (!categoryObj) {
            return res.status(400).json({ error: 'Invalid category name' });
        }

        const sizeArray = Array.isArray(sizes) ? sizes : (sizes ? [sizes] : []);
        const priceArray = Array.isArray(prices) ? prices : (prices ? [prices] : []);
        const quantityArray = Array.isArray(quantities) ? quantities : (quantities ? [quantities] : []);

        const variants = sizeArray.map((size, i) => {
            const price = parseFloat(priceArray[i]);
            const stock = parseInt(quantityArray[i]) || 0;
            return {
                size: size || '',
                price: isNaN(price) ? 0 : price,
                stock: isNaN(stock) ? 0 : stock
            };
        }).filter(v => v.size && v.price > 0 && v.stock >= 0);

        if (variants.length === 0) {
            return res.status(400).json({ error: 'At least one valid size variant with price and stock is required' });
        }

        let images = existingImages ? (Array.isArray(existingImages) ? existingImages : [existingImages]) : [];
        if (Array.isArray(croppedImages)) {
            const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'product-images');
            ensureDirectoryExists(uploadDir);
            for (let i = 0; i < croppedImages.length; i++) {
                if (croppedImages[i]) {
                    const filename = `product-${Date.now()}-${i}.jpg`;
                    const imagePath = path.join(uploadDir, filename);
                    saveBase64Image(croppedImages[i], imagePath);
                    images.push(filename);
                }
            }
        }

        product.name = productName;
        product.description = description;
        product.regularPrice = parseFloat(regularPrice);
        product.offer = offer ? parseFloat(offer) : 0;
        product.category = categoryObj._id;
        product.variants = variants;
        product.displayLocation = displayLocation || 'none';
        product.images = images;

        await product.calculateOfferPrice();
        await product.save();

        return res.redirect('/admin/products');
    } catch (err) {
        console.error('Error updating product:', err);
        return res.redirect('/error');
    }
};

const getProductDetails = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category');
        if (!product) {
            return res.status(404).render('error', { message: 'Product not found' });
        }
        res.render('product-details', { product });
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(500).render('error', { message: 'Server error' });
    }
};

module.exports = {
    getProductAddPage,
    getAllProducts,
    addProduct,
    updateOffer,
    blockUnblockProduct,
    editLoad,
    updateProduct,
    getProductDetails
};