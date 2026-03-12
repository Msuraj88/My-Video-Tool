exports.errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    // Default to 500 if no status code is set
    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
        error: {
            message: err.message || 'Internal Server Error',
            status: statusCode
        }
    });
};
