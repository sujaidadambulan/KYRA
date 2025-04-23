const fs = require('fs');
const path = require('path');

const ensureDirectoryExists = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const saveBase64Image = (base64String, filePath) => {
    try {
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    } catch (err) {
        console.error("Error saving base64 image:", err);
    }
};

module.exports = { ensureDirectoryExists, saveBase64Image }