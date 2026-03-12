const serverless = require('serverless-http');
const app = require('./app');

// Wrap the Express app with serverless-http
module.exports.handler = serverless(app);
