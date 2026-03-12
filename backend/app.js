const express = require('express');
const cors = require('cors');
require('dotenv').config();

const routes = require('./routes');
const { errorHandler } = require('./utils/errorHandler');

const app = express();

// Allow cross-origin requests from our local HTML file
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Base route for health check
app.get('/', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API is running' });
});

// Setup routes
app.use('/api', routes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
