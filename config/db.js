const mongoose = require('mongoose') ;
const env = require('dotenv').config();

const mongoConnect = async()=>{
    try{
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('mongodb connected')
    }catch(err){
        console.log(err)
    }
}

module.exports = mongoConnect