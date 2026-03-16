const path = require('path');
const app = require('./app');
const config = require('./config');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'service-account.json');
}

const PORT = config.port || 3000;

app.listen(PORT, () => {
    console.log(`Server is running locally on port ${PORT}`);
});
