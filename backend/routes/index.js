const express = require('express');
const router = express.Router();
const helloService = require('../services/hello.service');
const videoController = require('../controllers/video.controller');

router.get('/', (req, res) => {
    res.json({ message: 'Welcome to the Serverless Express API' });
});

router.get('/hello', (req, res) => {
    const data = helloService.getHelloMessage();
    res.json(data);
});

// Video Generation Endpoint
router.post('/generate-video', videoController.generateVideo);

module.exports = router;
