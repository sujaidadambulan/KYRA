const bcrypt = require('bcrypt');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Category = require('../../models/categorySchema');
const moment = require('moment');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 60 }); // Reduced TTL for fresher data

const loadLogin = async (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect('/admin');
        }
        res.render('admin-login', { message: null });
    } catch (err) {
        console.error('Error loading login:', err.message, err.stack);
        res.redirect('/admin/adminLogin');
    }
};

const error = async (req, res) => {
    try {
        res.render('adminError');
    } catch (err) {
        console.error('Error rendering error page:', err.message, err.stack);
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            return res.redirect('/admin/adminLogin');
        }

        const passwordCheck = await bcrypt.compare(password, admin.password);
        if (passwordCheck) {
            req.session.admin = admin._id;
            return res.redirect('/admin');
        } else {
            return res.redirect('/admin/adminLogin');
        }
    } catch (err) {
        console.error('Admin login error:', err.message, err.stack);
        return res.redirect('/admin/adminError');
    }
};

const loadDashboard = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin/adminLogin');
    }

    try {
        const filterType = req.query.filter || 'daily';
        let startDate, endDate;

        switch (filterType) {
            case 'daily':
                startDate = moment().startOf('day');
                endDate = moment().endOf('day');
                break;
            case 'weekly':
                startDate = moment().startOf('week');
                endDate = moment().endOf('week');
                break;
            case 'monthly':
                startDate = moment().startOf('month');
                endDate = moment().endOf('month');
                break;
            case 'yearly':
                startDate = moment().startOf('year');
                endDate = moment().endOf('year');
                break;
            case 'custom':
                startDate = req.query.startDate && moment(req.query.startDate).isValid()
                    ? moment(req.query.startDate)
                    : moment().startOf('month');
                endDate = req.query.endDate && moment(req.query.endDate).isValid()
                    ? moment(req.query.endDate)
                    : moment().endOf('month');
                if (startDate.isAfter(endDate)) {
                    throw new Error('Start date must be before end date');
                }
                break;
            default:
                startDate = moment().startOf('day');
                endDate = moment().endOf('day');
        }

        const cacheKey = `dashboard_${filterType}_${startDate.format('YYYYMMDD')}_${endDate.format('YYYYMMDD')}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            console.log('Serving cached dashboard data:', cacheKey);
            return res.render('dashboard', cachedData);
        }

        const orders = await Order.find({
            createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
            status: 'Delivered'
        })
            .populate('user', 'name')
            .populate({
                path: 'items.product',
                select: 'name category',
                populate: { path: 'category', select: 'name' }
            })
            .limit(1000) // Limit to prevent performance issues
            .lean();

        console.log('Orders fetched:', orders.length);

        const totalSales = orders.length;
        const totalRevenue = orders.reduce((sum, order) => sum + (order.subtotal || 0), 0);
        const totalDiscount = orders.reduce((sum, order) => sum + (order.discount || 0), 0);
        const totalCoupon = orders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0);
        const netRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);

        const productSales = {};
        orders.forEach(order => {
            order.items.forEach(item => {
                if (item.product) {
                    const productId = item.product._id.toString();
                    if (!productSales[productId]) {
                        productSales[productId] = {
                            name: item.product.name,
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    productSales[productId].quantity += item.quantity;
                    productSales[productId].revenue += item.quantity * item.price;
                }
            });
        });

        const topProducts = Object.entries(productSales)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

        const categorySales = {};
        for (const order of orders) {
            for (const item of order.items) {
                if (item.product && item.product.category) {
                    const categoryId = item.product.category._id.toString();
                    const categoryName = item.product.category.name || 'Unknown';
                    if (!categorySales[categoryId]) {
                        categorySales[categoryId] = {
                            name: categoryName,
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    categorySales[categoryId].quantity += item.quantity;
                    categorySales[categoryId].revenue += item.quantity * item.price;
                }
            }
        }

        const topCategories = Object.entries(categorySales)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

        let chartData;
        switch (filterType) {
            case 'daily':
                chartData = Array(24).fill(0).map((_, i) => ({
                    time: `${i}:00`,
                    revenue: orders
                        .filter(o => moment(o.createdAt).hour() === i)
                        .reduce((sum, o) => sum + (o.total || 0), 0)
                }));
                break;
            case 'weekly':
                chartData = Array(7).fill(0).map((_, i) => ({
                    time: moment().startOf('week').add(i, 'days').format('ddd'),
                    revenue: orders
                        .filter(o => moment(o.createdAt).day() === i)
                        .reduce((sum, o) => sum + (o.total || 0), 0)
                }));
                break;
            case 'monthly':
                const daysInMonth = moment().daysInMonth();
                chartData = Array(daysInMonth).fill(0).map((_, i) => ({
                    time: `${i + 1}`,
                    revenue: orders
                        .filter(o => moment(o.createdAt).date() === i + 1)
                        .reduce((sum, o) => sum + (o.total || 0), 0)
                }));
                break;
            case 'yearly':
                chartData = Array(12).fill(0).map((_, i) => ({
                    time: moment().month(i).format('MMM'),
                    revenue: orders
                        .filter(o => moment(o.createdAt).month() === i)
                        .reduce((sum, o) => sum + (o.total || 0), 0)
                }));
                break;
            case 'custom':
                const diffDays = endDate.diff(startDate, 'days') + 1;
                chartData = Array(Math.min(diffDays, 31)).fill(0).map((_, i) => ({
                    time: moment(startDate).add(i, 'days').format('MMM D'),
                    revenue: orders
                        .filter(o => moment(o.createdAt).isSame(moment(startDate).add(i, 'days'), 'day'))
                        .reduce((sum, o) => sum + (o.total || 0), 0)
                }));
                break;
        }

        const renderData = {
            orders,
            totalSales,
            totalRevenue,
            totalDiscount: totalDiscount + totalCoupon,
            totalCoupon,
            netRevenue,
            filterType,
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
            moment,
            chartData: JSON.stringify(chartData),
            topProducts,
            topCategories
        };

        cache.set(cacheKey, renderData);
        res.render('dashboard', renderData);
    } catch (err) {
        console.error('Error loading dashboard:', err.message, err.stack);
        res.redirect('/admin/adminError');
    }
};

const downloadReport = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin/adminLogin');
    }

    try {
        const { filter, startDate, endDate, format } = req.query;
        let reportStart, reportEnd;

        switch (filter) {
            case 'daily':
                reportStart = moment().startOf('day');
                reportEnd = moment().endOf('day');
                break;
            case 'weekly':
                reportStart = moment().startOf('week');
                reportEnd = moment().endOf('week');
                break;
            case 'monthly':
                reportStart = moment().startOf('month');
                reportEnd = moment().endOf('month');
                break;
            case 'yearly':
                reportStart = moment().startOf('year');
                reportEnd = moment().endOf('year');
                break;
            case 'custom':
                if (!startDate || !endDate || !moment(startDate).isValid() || !moment(endDate).isValid()) {
                    throw new Error('Invalid start or end date');
                }
                reportStart = moment(startDate);
                reportEnd = moment(endDate);
                if (reportStart.isAfter(reportEnd)) {
                    throw new Error('Start date must be before end date');
                }
                break;
            default:
                reportStart = moment().startOf('day');
                reportEnd = moment().endOf('day');
        }

        const cacheKey = `report_${filter}_${reportStart.format('YYYYMMDD')}_${reportEnd.format('YYYYMMDD')}`;
        let orders = cache.get(cacheKey);
        if (!orders) {
            orders = await Order.find({
                createdAt: { $gte: reportStart.toDate(), $lte: reportEnd.toDate() },
                status: 'Delivered'
            })
                .populate('user', 'name')
                .populate({
                    path: 'items.product',
                    select: 'name category',
                    populate: { path: 'category', select: 'name' }
                })
                .limit(1000)
                .lean();
            cache.set(cacheKey, orders);
        }

        console.log('Report orders fetched:', orders.length);

        const totalSales = orders.length;
        const totalRevenue = orders.reduce((sum, order) => sum + (order.subtotal || 0), 0);
        const totalDiscount = orders.reduce((sum, order) => sum + (order.discount || 0), 0);
        const totalCoupon = orders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0);
        const netRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);

        const productSales = {};
        orders.forEach(order => {
            order.items.forEach(item => {
                if (item.product) {
                    const productId = item.product._id.toString();
                    if (!productSales[productId]) {
                        productSales[productId] = {
                            name: item.product.name,
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    productSales[productId].quantity += item.quantity;
                    productSales[productId].revenue += item.quantity * item.price;
                }
            });
        });

        const topProducts = Object.entries(productSales)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

        const categorySales = {};
        for (const order of orders) {
            for (const item of order.items) {
                if (item.product && item.product.category) {
                    const categoryId = item.product.category._id.toString();
                    const categoryName = item.product.category.name || 'Unknown';
                    if (!categorySales[categoryId]) {
                        categorySales[categoryId] = {
                            name: categoryName,
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    categorySales[categoryId].quantity += item.quantity;
                    categorySales[categoryId].revenue += item.quantity * item.price;
                }
            }
        }

        const topCategories = Object.entries(categorySales)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Disposition', `attachment; filename="Sales_Report_${filter}_${reportStart.format('YYYYMMDD')}-${reportEnd.format('YYYYMMDD')}.pdf"`);
            res.setHeader('Content-Type', 'application/pdf');
            doc.pipe(res);

            doc.fontSize(20).text('Sales Report', { align: 'center' });
            doc.fontSize(12).text(
                `Period: ${reportStart.format('MMM D, YYYY')} - ${reportEnd.format('MMM D, YYYY')}`,
                { align: 'center' }
            );
            doc.moveDown(2);

            doc.fontSize(14).text('Summary', { underline: true });
            doc.moveDown(0.5);
            const summaryStart = doc.y;
            doc.fontSize(10)
               .text(`Total Sales: ${totalSales}`, 50, summaryStart)
               .text(`Total Revenue: ₹${totalRevenue.toFixed(2)}`, 50, doc.y + 15)
               .text(`Total Discount: ₹${(totalDiscount + totalCoupon).toFixed(2)}`, 50, doc.y + 15)
               .text(`Total Coupon: ₹${totalCoupon.toFixed(2)}`, 50, doc.y + 15)
               .text(`Net Revenue: ₹${netRevenue.toFixed(2)}`, 50, doc.y + 15);
            doc.moveDown(2);

            doc.fontSize(14).text('Top 10 Products', { underline: true });
            let yPosition = doc.y + 20;
            topProducts.forEach((product, index) => {
                const lineHeight = 20;
                if (yPosition + lineHeight > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage();
                    yPosition = doc.page.margins.top;
                }
                doc.fontSize(10).text(
                    `${index + 1}. ${product.name} | Units Sold: ${product.quantity} | Revenue: ₹${product.revenue.toFixed(2)}`,
                    50, yPosition
                );
                yPosition += lineHeight;
            });
            doc.moveDown(2);

            doc.fontSize(14).text('Top 10 Categories', { underline: true });
            yPosition = doc.y + 20;
            topCategories.forEach((category, index) => {
                const lineHeight = 20;
                if (yPosition + lineHeight > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage();
                    yPosition = doc.page.margins.top;
                }
                doc.fontSize(10).text(
                    `${index + 1}. ${category.name} | Units Sold: ${category.quantity} | Revenue: ₹${category.revenue.toFixed(2)}`,
                    50, yPosition
                );
                yPosition += lineHeight;
            });
            doc.moveDown(2);

            doc.fontSize(14).text('Detailed Report', { underline: true });
            yPosition = doc.y + 20;
            orders.forEach((order, index) => {
                const lineHeight = 20;
                if (yPosition + lineHeight > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage();
                    yPosition = doc.page.margins.top;
                }
                doc.fontSize(10).text(
                    `${index + 1}. Date: ${moment(order.createdAt).format('MMM D, YYYY')} | Order ID: ${order.orderId} | Customer: ${order.user ? order.user.name : 'Unknown'} | Items: ${order.items.length} | Subtotal: ₹${(order.subtotal || 0).toFixed(2)} | Discount: ₹${(order.discount || 0).toFixed(2)} | Coupon: ₹${(order.couponDiscount || 0).toFixed(2)} | Final Amount: ₹${(order.total || 0).toFixed(2)}`,
                    50, yPosition
                );
                yPosition += lineHeight;
            });

            doc.end();
        } else if (format === 'excel') {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Sales Report', {
                properties: { tabColor: { argb: 'FF5865F2' } }
            });

            worksheet.columns = [
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Order ID', key: 'orderId', width: 15 },
                { header: 'Customer', key: 'customerName', width: 20 },
                { header: 'Items', key: 'items', width: 10 },
                { header: 'Subtotal', key: 'subtotal', width: 15 },
                { header: 'Discount', key: 'discount', width: 15 },
                { header: 'Coupon', key: 'coupon', width: 15 },
                { header: 'Final Amount', key: 'finalAmount', width: 15 }
            ];

            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF383B40' }
            };

            worksheet.mergeCells('A1:D1');
            worksheet.getCell('A1').value = 'Sales Report Summary';
            worksheet.getCell('A1').font = { size: 14, bold: true };
            worksheet.getCell('A1').alignment = { horizontal: 'center' };

            const summaryData = [
                ['Total Sales', totalSales],
                ['Total Revenue', `₹${totalRevenue.toFixed(2)}`],
                ['Total Discount', `₹${(totalDiscount + totalCoupon).toFixed(2)}`],
                ['Total Coupon', `₹${totalCoupon.toFixed(2)}`],
                ['Net Revenue', `₹${netRevenue.toFixed(2)}`]
            ];
            summaryData.forEach((row, idx) => {
                worksheet.getRow(idx + 2).values = row;
                worksheet.getRow(idx + 2).font = { bold: idx === 0 };
            });

            worksheet.addRow([]);
            worksheet.addRow(['Top 10 Products']).font = { bold: true, size: 12 };
            worksheet.addRow(['Name', 'Units Sold', 'Revenue']).font = { bold: true };
            topProducts.forEach(product => {
                worksheet.addRow({
                    date: product.name,
                    orderId: product.quantity,
                    customerName: `₹${product.revenue.toFixed(2)}`
                });
            });

            worksheet.addRow([]);
            worksheet.addRow(['Top 10 Categories']).font = { bold: true, size: 12 };
            worksheet.addRow(['Name', 'Units Sold', 'Revenue']).font = { bold: true };
            topCategories.forEach(category => {
                worksheet.addRow({
                    date: category.name,
                    orderId: category.quantity,
                    customerName: `₹${category.revenue.toFixed(2)}`
                });
            });

            worksheet.addRow([]);
            worksheet.addRow(['Detailed Report']).font = { bold: true, size: 12 };

            orders.forEach(order => {
                worksheet.addRow({
                    date: moment(order.createdAt).format('MMM D, YYYY'),
                    orderId: order.orderId,
                    customerName: order.user ? order.user.name : 'Unknown',
                    items: order.items.length,
                    subtotal: (order.subtotal || 0).toFixed(2),
                    discount: (order.discount || 0).toFixed(2),
                    coupon: (order.couponDiscount || 0).toFixed(2),
                    finalAmount: (order.total || 0).toFixed(2)
                });
            });

            worksheet.autoFilter = { from: 'A8', to: 'H8' };

            res.setHeader('Content-Disposition', `attachment; filename="Sales_Report_${filter}_${reportStart.format('YYYYMMDD')}-${reportEnd.format('YYYYMMDD')}.xlsx"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            await workbook.xlsx.write(res);
            res.end();
        }
    } catch (err) {
        console.error('Error downloading report:', err.message, err.stack);
        res.redirect('/adminError');
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err.message, err.stack);
                return res.redirect('/admin/adminError');
            }
            res.redirect('/admin/adminLogin');
        });
    } catch (err) {
        console.error('Logout error:', err.message, err.stack);
        res.redirect('/admin/adminError');
    }
};

module.exports = { loadLogin, login, loadDashboard, downloadReport, logout, error };