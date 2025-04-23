const express = require('express');
const route = express.Router();
const adminController = require('../controllers/admin/adminController');
const coustomerController  = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const upload = require('../config/multerConfig');
const adminOrderController = require('../controllers/admin/orderController');
const adminCoupon = require('../controllers/admin/couponController');
const adminWallet = require('../controllers/admin/adminWallet');
const {userAuth,adminAuth,} = require('../middlewares/auth');

route.get('/adminLogin', adminController.loadLogin);
route.post('/adminLogin', adminController.login);
route.get('/',adminAuth,adminController.loadDashboard);
route.get('/logout',adminController.logout);
route.get('/adminError',adminController.error);
route.get('/download', adminController.downloadReport);

route.get('/users',adminAuth,coustomerController.user);
route.get('/blockCustomer',adminAuth,coustomerController.blockCustomer);
route.get('/unblockCustomer',adminAuth,coustomerController.unblockCustomer);

route.get('/category', adminAuth, categoryController.getCategories);
route.post('/addCategory', adminAuth, categoryController.addCategory);
route.patch('/toggleCategory', adminAuth, categoryController.toggleCategory);
route.delete('/deleteCategory', adminAuth, categoryController.deleteCategory);
route.post('/addOffer', adminAuth, categoryController.addOffer);
route.post('/removeOffer', adminAuth, categoryController.removeOffer)
route.post('/editCategory', adminAuth, categoryController.editCategory);

route.get('/products', adminAuth, productController.getAllProducts);
route.get('/addProduct', adminAuth, productController.getProductAddPage);
route.post('/addProduct', adminAuth, upload.array('images', 3), productController.addProduct);
route.post('/update-offer', adminAuth, productController.updateOffer);
route.post('/product-action', adminAuth, productController.blockUnblockProduct);
route.get('/productEdit/:id', adminAuth, productController.editLoad);
route.post('/updateProduct', adminAuth,upload.array(),productController.updateProduct);

route.get('/orders', adminAuth, adminOrderController.loadAdminOrders);
route.post('/order/status', adminAuth, adminOrderController.updateOrderStatus);
route.post('/order/verify-return', adminAuth, adminOrderController.verifyReturnRequest);
route.get('/order/:orderId', adminAuth, adminOrderController.loadOrderDetails);

route.get('/coupon',adminAuth, adminCoupon.loadCoupon);
route.post('/coupon/create',adminAuth, adminCoupon.createCoupon);
route.delete('/coupon/delete/:couponId',adminAuth, adminCoupon.deleteCoupon);
route.get('/coupon/:couponId',adminAuth, adminCoupon.getCoupon); 
route.post('/coupon/update',adminAuth,adminCoupon.updateCoupon); 

route.get('/wallet', adminAuth, adminWallet.loadWallet);
route.get('/wallet/transaction/:userId/:transactionId', adminAuth, adminWallet.viewTransaction);

module.exports = route;
