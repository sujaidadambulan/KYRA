const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    regularPrice: { type: Number, required: true, min: 0 },
    variants: [{
        size: { type: String, required: true },
        stock: { type: Number, required: true, min: 0 },
        price: { type: Number, required: true, min: 0 },
        offerPrice: { type: Number, default: 0 } 
    }],
    offer: { type: Number, default: 0, min: 0, max: 100 },
    offerPrice: { type: Number, default: 0 }, 
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    displayLocation: { type: String, enum: ['home', 'featured', 'trending', 'none'], default: 'none' },
    images: [{ type: String }],
    isListed: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
}, { timestamps: true });

productSchema.methods.calculateOfferPrice = async function () {
    if (!this.populated('category') && this.category) {
        await this.populate('category');
    }

    const category = this.category;
    const now = new Date();

    let categoryDiscount = 0;
    let categoryDiscountValid = false;
    if (category && category.offer && category.offer.discount_percentage) {
        categoryDiscount = parseFloat(category.offer.discount_percentage.toString()) || 0;
        categoryDiscountValid = category.offer.valid_until 
            ? new Date(category.offer.valid_until) > now 
            : false;
    }

    const productDiscount = this.offer || 0;

    let maxDiscount = 0;
    let discountSource = 'None';
    if (categoryDiscountValid && categoryDiscount > 0) {
        maxDiscount = categoryDiscount;
        discountSource = 'Category';
    }
    if (productDiscount > maxDiscount) {
        maxDiscount = productDiscount;
        discountSource = 'Product';
    }

    if (this.variants && this.variants.length > 0) {
        this.variants.forEach(variant => {
            variant.offerPrice = maxDiscount > 0 
                ? Math.round(variant.price * (1 - maxDiscount / 100))
                : (variant.price || 0);
        });

        const variantOfferPrices = this.variants.map(v => v.offerPrice || v.price || 0).filter(p => p > 0);
        this.offerPrice = variantOfferPrices.length > 0 ? Math.min(...variantOfferPrices) : (this.variants[0]?.price || 0);
    } else {
        this.offerPrice = this.regularPrice || 0;
        if (maxDiscount > 0) {
            this.offerPrice = Math.round((this.regularPrice || 0) * (1 - maxDiscount / 100));
        }
    }

    return { offerPrice: this.offerPrice, discountSource };
};

productSchema.pre('save', async function (next) {
    if (this.isModified('offer') || this.isModified('variants') || this.isModified('category')) {
        const result = await this.calculateOfferPrice();
        console.log(`Calculated offer price: ${result.offerPrice}, Source: ${result.discountSource}`);
    }
    next();
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;