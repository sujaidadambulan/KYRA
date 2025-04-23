const User = require('../../models/userSchema');

const user = async (req, res) => {
    try {
        let search = req.query.search || '';
        let page = parseInt(req.query.page) || 1;
        const limit = 10;

        const userDate = await User.find({
            isAdmin: false,
            $or: [
                { fullname: { $regex: '.*' + search + '.*', $options: 'i' } },
                { email: { $regex: '.*' + search + '.*', $options: 'i' } }
            ],
        })
        .limit(limit)
        .skip((page - 1) * limit)
        .exec();

        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { fullname: { $regex: '.*' + search + '.*', $options: 'i' } },
                { email: { $regex: '.*' + search + '.*', $options: 'i' } }
            ],
        });

        res.render('customers', { data: userDate, count, page, limit, search });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

const blockCustomer = async (req, res) => {
    try {
        let id = req.query.id;
        await User.findOneAndUpdate({ _id: id }, { $set: { isBlocked: true } });
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.redirect('/error');
    }
};

const unblockCustomer = async (req, res) => {
    try {
        let id = req.query.id;
        await User.findOneAndUpdate({ _id: id }, { $set: { isBlocked: false } });
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.redirect('/error');
    }
};
module.exports = { user , blockCustomer , unblockCustomer};
