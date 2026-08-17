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

// Staged script-to-video workflow
router.post('/projects', videoController.splitScript);
router.get('/projects/:projectId', videoController.getProject);
router.put('/projects/:projectId/scenes', videoController.updateScenes);
router.post('/projects/:projectId/generate-images', videoController.generateAllImages);
router.post('/projects/:projectId/scenes/:sceneId/generate-image', videoController.generateSceneImage);
router.post('/projects/:projectId/generate-video', videoController.assembleVideo);
router.get('/projects/:projectId/images/:fileName', videoController.serveImage);
router.get('/projects/:projectId/video', videoController.serveVideo);

// Legacy one-shot video generation
router.post('/generate-video', videoController.generateVideo);

module.exports = router;
