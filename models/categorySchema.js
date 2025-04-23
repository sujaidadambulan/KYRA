const mongoose = require("mongoose");
const { Schema } = mongoose;
const Product = require("./productSchema");

const categorySchema = new Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    status: { type: Boolean, default: true },
    updated_at: { type: Date, default: Date.now },
    offer: {
        discount_percentage: { type: Number, default: 0 }, 
        valid_until: { type: Date },
        description: { type: String }
    }
});

categorySchema.pre('save', async function (next) {
    if (this.isModified('offer')) {
        const categoryId = this._id;

        const products = await Product.find({ category: categoryId }).lean();
        for (let product of products) {
            const updatedProduct = await Product.findById(product._id);
            if (updatedProduct) {
                await updatedProduct.calculateOfferPrice();
                await updatedProduct.save();
            }
        }
    }
    this.updated_at = Date.now(); 
    next();
});

const Category = mongoose.models.Category || mongoose.model("Category", categorySchema);
module.exports = Category;