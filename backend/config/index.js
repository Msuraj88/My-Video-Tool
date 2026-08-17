require('dotenv').config();

module.exports = {
    port: process.env.PORT || 8000,
    nodeEnv: process.env.NODE_ENV || 'development',
    // add other configuration variables here
};
