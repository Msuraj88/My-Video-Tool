const path = require('path');
const app = require('./app');
const config = require('./config');

const { ensureAllTempDirs } = require('./utils/tempDirs');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'service-account.json');
}

ensureAllTempDirs();

const PORT = config.port || 8000;

app.listen(PORT, () => {
    console.log(`Server is running locally on port ${PORT}`);
});
