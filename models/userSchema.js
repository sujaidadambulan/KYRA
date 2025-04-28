const mongoose = require("mongoose");
const {Schema} = mongoose;

const userSchema = new Schema({
   fullname : {
       type:String,
       required : true
   },
   email: {
       type : String,
       required:true,
       unique: true,
   },
   phone : {
       type : String,
       required: false,
       unique: false,
       sparse:true,
       default:null
   },
   googleId: {
       type : String,
       default: undefined,
       unique:true,
       sparse: true
   },
   password : {
       type:String,
       required :false
   },
   isBlocked: {
       type : Boolean,
       default:false
   },
   isAdmin : {
       type: Boolean,
       default:false
   },
   cart: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    size: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    price: { type: Number, required: true }
    }],
    wishlist: [{ type: Schema.Types.ObjectId, ref: "Wishlist" }],
    wallet: {
        type: Number,
        default: 0,
    },
    walletTransactions: [{
        description: { type: String, required: true },
        amount: { type: Number, required: true }, 
        orderId: { type: String }, 
        createdAt: { type: Date, default: Date.now }
    }],
   orderHistory:[{
       type:Schema.Types.ObjectId,
       ref:"Order"
   }],
   wishlist: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
   createdOn : {
       type:Date,
       default:Date.now,
   },
   addresses: [{
    fullName: String,
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
    primaryContact: String,
    alternativeContact: String,
    isDefault: Boolean
  }]
})

userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const User = mongoose.model("User",userSchema);

module.exports = User;