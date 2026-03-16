const app = require('./app');
const { startExpiryLoop } = require('./services/expireOrders');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.error(`Backend running on port ${PORT}`);
  startExpiryLoop();
});
