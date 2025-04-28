const mongoose = require('mongoose');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');

const getCategories = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        const query = search ? { name: { $regex: search, $options: 'i' } } : {};
        const total = await Category.countDocuments(query);

        const categories = await Category.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit);

        const totalPages = Math.ceil(total / limit);

        res.render('category', {
            cat: categories,
            currentPage: page,
            totalPages,
            search
        });
    } catch (err) {
        console.error("Error fetching categories:", err);
        res.status(500).render('adminError', { message: "Failed to load categories" });
    }
};

const addCategory = async (req, res) => {
    try {
        const { name, description, offer } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Category name is required" });
        }
        if (!description || !description.trim()) {
            return res.status(400).json({ error: "Category description is required" });
        }

        const existingCategory = await Category.findOne({
            name: { $regex: `^${name.trim()}$`, $options: 'i' }
        });
        if (existingCategory) {
            return res.status(400).json({ error: "Category name already exists" });
        }

        const category = new Category({
            name: name.trim(),
            description: description.trim(),
            status: true
        });

        if (offer && parseFloat(offer) > 0) {
            const validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + 30); 
            category.offer = {
                discount_percentage: parseFloat(offer),
                valid_until: validUntil,
                description: `${offer}% discount on all items in this category`
            };
        }

        await category.save();
        res.status(201).json({ message: "Category added successfully" });
    } catch (err) {
        console.error("Add category error:", err);
        if (err.name === 'ValidationError') {
            const errorMessages = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ error: errorMessages.join(', ') });
        }
        res.status(500).json({ error: "Failed to add category" });
    }
};

const editCategory = async (req, res) => {
    try {
        const { categoryId, name, description } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Category name is required" });
        }
        if (!description || !description.trim()) {
            return res.status(400).json({ error: "Category description is required" });
        }

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        const existingCategory = await Category.findOne({
            name: name.trim(),
            _id: { $ne: categoryId }
        });
        if (existingCategory) {
            return res.status(400).json({ error: "Category name already exists" });
        }

        await Category.findByIdAndUpdate(categoryId, {
            name: name.trim(),
            description: description.trim(),
            updated_at: Date.now() 
        });

        res.json({ message: "Category updated successfully" });
    } catch (err) {
        console.error("Edit category error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const categoryId = req.query.id;

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        await Category.findByIdAndDelete(categoryId);
        res.json({ message: "Category deleted successfully" });
    } catch (err) {
        console.error("Delete category error:", err);
        res.status(500).json({ error: "Failed to delete category" });
    }
};

const toggleCategory = async (req, res) => {
    try {
        const { id, action } = req.query;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        const status = action === 'list';
        await Category.findByIdAndUpdate(id, { status, updated_at: Date.now() }); 

        res.json({ message: `Category ${action}ed successfully` });
    } catch (err) {
        console.error("Toggle category error:", err);
        res.status(500).json({ error: "Failed to update category status" });
    }
};

const addOffer = async (req, res) => {
    try {
        const { categoryId, discount_percentage, valid_until, description } = req.body;

        if (!discount_percentage || parseFloat(discount_percentage) <= 0) {
            return res.status(400).json({ error: "Valid discount percentage is required" });
        }

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        category.offer = {
            discount_percentage: parseFloat(discount_percentage),
            valid_until: valid_until ? new Date(valid_until) : undefined,
            description: description || `${discount_percentage}% off on all items in this category`
        };
        category.updated_at = Date.now();

        await category.save();

        const products = await Product.find({ category: categoryId });
        for (let product of products) {
            await product.calculateOfferPrice();
            await product.save();
        }

        res.json({ message: "Offer added successfully" });
    } catch (err) {
        console.error("Add offer error:", err);
        res.status(500).json({ error: "Failed to add offer" });
    }
};

const removeOffer = async (req, res) => {
    try {
        const { categoryId } = req.body;

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        await Category.findByIdAndUpdate(categoryId, { $unset: { offer: 1 }, updated_at: Date.now() });

        const products = await Product.find({ category: categoryId });
        for (let product of products) {
            await product.calculateOfferPrice();
            await product.save();
        }

        res.json({ message: "Offer removed successfully" });
    } catch (err) {
        console.error("Remove offer error:", err);
        res.status(500).json({ error: "Failed to remove offer" });
    }
};

module.exports = {
    getCategories,
    addCategory,
    editCategory,
    deleteCategory,
    toggleCategory,
    addOffer,
    removeOffer
};