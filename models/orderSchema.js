const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { 
        type: String, 
        unique: true, 
        required: true,
        default: () => 'ORD-' + Math.random().toString(36).substr(2, 9).toUpperCase()
    },
    items: [{
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        size: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        regularPrice: { type: Number, required: true }, 
        total: { type: Number, required: true }, 
        isCancelled: { type: Boolean, default: false },
        returnRequest: {
            requested: { type: Boolean, default: false },
            reason: { type: String },
            status: { 
                type: String, 
                enum: ['Pending', 'Approved', 'Rejected'], 
                default: 'Pending' 
            },
            rejectMessage: { type: String }
        }
    }],
    shippingAddress: {
        fullName: String, 
        street: String,
        city: String,
        state: String,
        postalCode: String,
        country: String,
        primaryContact: String,
        alternativeContact: String
    },
    paymentMethod: { type: String, required: true },
    subtotal: { type: Number, required: true }, 
    shipping: { type: Number, default: 50 },
    discount: { type: Number, default: 0 }, 
    couponDiscount: { type: Number, default: 0 }, 
    walletAmount: { type: Number, default: 0 }, 
    total: { type: Number, required: true }, 
    status: { 
        type: String, 
        enum: ['Pending', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Failed'],
        default: 'Pending' 
    },
    failureReason: {
        type: String,
        required: function() { return this.status === 'Failed'; }
    },
    createdAt: { type: Date, default: Date.now }
});

orderSchema.pre('save', async function (next) {
    if (this.isModified('items') || this.isModified('couponDiscount')) {
        await this.populate('items.product');
        this.subtotal = this.items.reduce((sum, item) => sum + item.regularPrice * item.quantity, 0);
        this.discount = this.items.reduce((sum, item) => {
            const discountPerItem = (item.regularPrice - item.price) * item.quantity;
            return sum + discountPerItem;
        }, 0);
        this.total = this.subtotal - this.discount - this.couponDiscount + this.shipping;
    }
    next();
});

module.exports = mongoose.model('Order', orderSchema);