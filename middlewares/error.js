const User = require('../models/userSchema'); 

async function errorHandler(err, req, res, next) {
  console.error(err.stack);

  const statusCode = err.statusCode || 500;
  const message = err.message || (statusCode === 404 ? 'Not Found' : 'Internal Server Error');

  if (req.accepts('json') && !req.accepts('html')) {
    res.status(statusCode).json({
      success: false,
      message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  } else {
    let user = null;
    try {
      if (req.session.user) {
        user = await User.findById(req.session.user);
      }
    } catch (userErr) {
      console.error('Error fetching user in errorHandler:', userErr);
    }

    if (statusCode === 404) {
      res.status(404).render('error', {
        message,
        user,
        currentPage: null,
      });
    } else {
      res.status(500).render('serverError', {
        message,
        user,
        currentPage: null,
      });
    }
  }
}

module.exports = errorHandler;