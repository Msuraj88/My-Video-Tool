exports.getHelloMessage = () => {
    return {
        message: 'Hello from the service layer!',
        timestamp: new Date().toISOString()
    };
};
