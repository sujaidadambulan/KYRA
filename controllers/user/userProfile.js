const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');

const loadProfile = async (req, res) => {
    try {
        const userData = await User.findById(req.session.user);
        if (!userData) {
            return res.redirect('/login');
        }
        const success = req.query.update === 'success'; 
        res.render('userProfile', {
            currentPage: 'userProfile',
            user: userData,
            success 
        });
    } catch (err) {
        console.error('Error loading profile:', err);
        res.status(500).render('error', { message: 'Server Error' });
    }
};

const loadEditProfile = async (req, res) => {
    try {
        const userData = await User.findById(req.session.user);
        if (!userData) {
            return res.redirect('/login');
        }
        res.render('editProfile', {
            currentPage: 'userProfile',
            user: userData,
            error: null,
        });
    } catch (err) {
        console.error('Error loading edit profile:', err);
        res.status(500).render('error', { message: 'Server Error' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { fullname, phone, password, confirmPassword } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const phoneRegex = /^\d{10}$/;

        if (!fullname || fullname.trim() === '') {
            return res.render('editProfile', {
                currentPage: 'userProfile',
                user: { fullname, phone },
                error: 'Full name is required',
            });
        }

        if (!phone || !phoneRegex.test(phone)) {
            return res.render('editProfile', {
                currentPage: 'userProfile',
                user: { fullname, phone },
                error: 'Please enter a valid 10-digit phone number',
            });
        }

        const updateData = { fullname, phone };

        if (password && confirmPassword) {
            if (password !== confirmPassword) {
                return res.render('editProfile', {
                    currentPage: 'userProfile',
                    user: { fullname, phone },
                    error: 'Passwords do not match',
                });
            }
            if (password.length < 6) {
                return res.render('editProfile', {
                    currentPage: 'userProfile',
                    user: { fullname, phone },
                    error: 'Password must be at least 6 characters long',
                });
            }
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            updateData.password = hashedPassword;
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
        if (!updatedUser) {
            return res.status(404).render('error', { message: 'User not found' });
        }

        res.redirect('/profile?update=success'); 
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).render('editProfile', {
            currentPage: 'userProfile',
            user: { fullname: req.body.fullname, phone: req.body.phone },
            error: 'An unexpected error occurred. Please try again.',
        });
    }
};

const loadAddress = async (req, res) => {
    try {
        const userData = await User.findById(req.session.user);
        res.render('address', {
            currentPage: 'address',
            user: userData,
            addresses: userData.addresses || []
        });
    } catch (err) {
        console.log(err);
        res.status(500).send('Server Error');
    }
};
const addAddress = async (req, res) => {
    try {
        const { fullName, street, city, state, postalCode, country, primaryContact, alternativeContact, isDefault } = req.body;
        if (!fullName || !street || !city || !state || !postalCode || !country || !primaryContact) {
            return res.render('add-address', { currentPage: 'address', user: await User.findById(req.session.user), error: 'All required fields must be filled' });
        }
        if (!/^\d{10}$/.test(primaryContact)) {
            return res.render('add-address', { currentPage: 'address', user: await User.findById(req.session.user), error: 'Primary contact must be a valid 10-digit phone number' });
        }

        const newAddress = {
            fullName,
            street,
            city,
            state,
            postalCode,
            country,
            primaryContact,
            alternativeContact: alternativeContact || null,
            isDefault: isDefault === 'on' || false
        };

        const user = await User.findById(req.session.user);
        if (!user) {
            return res.status(404).send('User not found');
        }

        if (newAddress.isDefault) {
            user.addresses.forEach(addr => (addr.isDefault = false));
        }
        user.addresses.push(newAddress);
        await user.save();
        res.redirect('/address');
    } catch (err) {
        console.log(err);
        res.status(500).send('An unexpected error occurred. Please try again later.');
    }
};

const editAddress = async (req, res) => {
    try {
        const { addressId, fullName, street, city, state, postalCode, country, primaryContact, alternativeContact, isDefault } = req.body;
        
        const user = await User.findById(req.session.user);
        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).send('Address not found');
        }

        if (isDefault === 'on') {
            user.addresses.forEach(addr => addr.isDefault = false);
        }

        user.addresses[addressIndex] = {
            ...user.addresses[addressIndex],
            fullName,
            street,
            city,
            state,
            postalCode,
            country,
            primaryContact,
            alternativeContact,
            isDefault: isDefault === 'on' || false
        };

        await user.save();
        res.redirect('/address');
    } catch (err) {
        console.log(err);
        res.status(500).send('Server Error');
    }
};

const deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        
        const user = await User.findById(req.session.user);
        user.addresses = user.addresses.filter(addr => addr._id.toString() !== addressId);
        
        await user.save();
        res.redirect('/address');
    } catch (err) {
        console.log(err);
        res.status(500).send('Server Error');
    }
};
const loadAddAddress = async (req, res) => {
    try {
        const userData = await User.findById(req.session.user);
        res.render('add-address', {
            currentPage: 'address',
            user: userData
        });
    } catch (err) {
        console.log(err);
        res.status(500).send('Server Error');
    }
};
const loadEditAddress = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).send('Please log in to edit an address');
        }
        const user = await User.findById(req.session.user);
        if (!user) {
            return res.status(404).send('User not found');
        }
        const address = user.addresses.find(addr => addr._id.toString() === req.params.addressId);
        if (!address) {
            return res.status(404).send('Address not found');
        }
        res.render('edit-address', {
            currentPage: 'address',
            user,
            address
        });
    } catch (err) {
        console.log(err);
        res.status(500).send('Server Error');
    }
};

module.exports = {
    loadProfile,
    loadEditProfile,
    updateProfile,
    loadAddress,
    addAddress,
    deleteAddress,
    editAddress,
    loadAddAddress,
    loadEditAddress
};

