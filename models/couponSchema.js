const mongoose = require('mongoose');
const { Schema } = mongoose;

const couponSchema = new Schema({
    code: { 
        type: String, 
        required: true, 
        unique: true, 
        uppercase: true, 
        trim: true 
    },
    discountType: { 
        type: String, 
        enum: ['percentage', 'fixed'], 
        required: true 
    },
    discountValue: { 
        type: Number, 
        required: true, 
        min: 0 
    },
    minPurchase: { 
        type: Number, 
        default: 0, 
        min: 0 
    },
    maxUses: { 
        type: Number, 
        default: 0, 
        min: 0 
    },
    uses: { 
        type: Number, 
        default: 0, 
        min: 0 
    },
    validFrom: { 
        type: Date, 
        required: true 
    },
    validTo: { 
        type: Date, 
        required: true 
    },
    description: { 
        type: String, 
        trim: true 
    },
    status: { 
        type: String, 
        enum: ['Active', 'Expired', 'Scheduled'], 
        default: 'Scheduled' 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

couponSchema.pre('save', function(next) {
    const now = new Date();
    if (now < this.validFrom) {
        this.status = 'Scheduled';
    } else if (now > this.validTo) {
        this.status = 'Expired';
    } else {
        this.status = 'Active';
    }
    next();
});

const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;