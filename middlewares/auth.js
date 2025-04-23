const User = require('../models/userSchema');

const userAuth = (req,res,next)=>{
    if(req.session.user){
        User.findById(req.session.user)
        .then((data)=>{
           if (data && !data.isBlocked){
                next()
            }else{
                res.redirect('/login')
            }
        })
        .catch((err)=>{
            console.log('error in user middleware',err);
            res.status(500).send('server error')
        })
    }else{
        res.redirect('/login')
    }
}

const adminAuth = async (req, res, next) => {
    try {
    
        if (!req.session || !req.session.admin) {
            return res.status(401).redirect('/admin/adminLogin');
        }

        const admin = await User.findOne({
            _id: req.session.admin,
            isAdmin: true
        }).select('_id email isAdmin isBlocked');

        if (!admin) {
            req.session.destroy(); 
            return res.status(403).redirect('/admin/adminLogin');
        }

        if (admin.isBlocked) {
            req.session.destroy();
            return res.status(403).redirect('/admin/adminLogin');
        }

        req.admin = {
            id: admin._id,
            email: admin.email
        };

        next();
    } catch (error) {
        console.error('Admin authentication middleware error:', error);
        req.session.destroy(); 
        res.status(500).redirect('/admin/adminLogin');
    }
};

const multer = require('multer');

const storage = multer.memoryStorage(); 

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 
    }
});

module.exports = {userAuth,adminAuth,upload};