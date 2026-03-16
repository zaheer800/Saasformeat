// Separate from index.js so tests can import the app without starting the server
// or the expiry loop.
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimiter } = require('./middleware/rateLimit');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL }));

app.use('/webhooks/razorpay',
  express.raw({ type: 'application/json' }),
  require('./routes/webhooks')
);

app.use(express.json());
app.use('/api', rateLimiter);

app.use('/api/orders', require('./routes/orders'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/delivery', require('./routes/delivery'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/shop', require('./routes/shop'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
