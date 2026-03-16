const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function createCODTokenLink(orderId, tokenAmount, customer) {
  const paymentLink = await razorpay.paymentLink.create({
    amount: tokenAmount * 100, // paise
    currency: 'INR',
    description: `Order confirmation token — Order #${orderId}`,
    customer: {
      name: customer.name,
      contact: customer.phone,
    },
    notify: { sms: true },
    reminder_enable: false,
    notes: { orderId, type: 'cod_token' },
    callback_url: `${process.env.FRONTEND_URL}/track/${orderId}`,
    callback_method: 'get',
  });

  return paymentLink.short_url;
}

module.exports = { razorpay, createCODTokenLink };
