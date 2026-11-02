# 💳 M-Pesa Payment Integration Guide

## Overview

Knight Watts Auto Parts checkout page is ready for M-Pesa payments! This guide shows you how to connect the real Safaricom M-Pesa Daraja API for live payment processing.

---

## 🎯 Current Status

**✅ Frontend Ready**
- Complete checkout page with M-Pesa option
- STK Push flow designed
- Payment confirmation UI ready

**🔄 To Enable Live Payments:**
- Set up Safaricom Daraja API account
- Create backend server for secure API calls
- Connect frontend to backend

---

## 📋 Requirements

### 1. Safaricom Daraja API Account

**Register Here**: https://developer.safaricom.co.ke/

**What You'll Get**:
- Consumer Key
- Consumer Secret
- Shortcode (Till/Paybill number)
- Passkey

### 2. M-Pesa Business Account

**Types**:
- **Paybill**: Better for established businesses (recommended)
- **Till Number**: Easier to get, good for starting

**Apply**: Visit Safaricom shop or M-Pesa agent

### 3. Backend Server

**Why Needed**:
- Your API keys MUST stay secret (not in frontend)
- Secure communication with Daraja API
- Handle callbacks and confirmations

**Options**:
- Node.js + Express
- Python + Flask/Django
- PHP
- Any server language

---

## 🚀 Quick Setup (Node.js Example)

### Step 1: Install Dependencies

```bash
npm init -y
npm install express cors axios dotenv
```

### Step 2: Create Backend Server

Create `server.js`:

```javascript
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// M-Pesa Configuration
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const PASSKEY = process.env.MPESA_PASSKEY;
const SHORTCODE = process.env.MPESA_SHORTCODE; // Your Paybill/Till
const CALLBACK_URL = process.env.CALLBACK_URL; // Your server URL

// Get Access Token
async function getAccessToken() {
    const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
    
    try {
        const response = await axios.get(
            'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${auth}`
                }
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error);
        throw error;
    }
}

// STK Push (Lipa Na M-Pesa Online)
app.post('/api/mpesa/stkpush', async (req, res) => {
    const { phoneNumber, amount, orderId } = req.body;
    
    // Format phone number (remove +, spaces)
    const phone = phoneNumber.replace(/[^0-9]/g, '');
    const formattedPhone = phone.startsWith('0') ? '254' + phone.substring(1) : phone;
    
    // Generate timestamp
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    
    // Generate password
    const password = Buffer.from(SHORTCODE + PASSKEY + timestamp).toString('base64');
    
    try {
        const token = await getAccessToken();
        
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            {
                BusinessShortCode: SHORTCODE,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline', // or 'CustomerBuyGoodsOnline' for Till
                Amount: Math.ceil(amount), // Must be integer
                PartyA: formattedPhone,
                PartyB: SHORTCODE,
                PhoneNumber: formattedPhone,
                CallBackURL: `${CALLBACK_URL}/api/mpesa/callback`,
                AccountReference: orderId,
                TransactionDesc: `Knight Watts Order ${orderId}`
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        res.json({
            success: true,
            checkoutRequestID: response.data.CheckoutRequestID,
            message: 'STK push sent. Please check your phone.'
        });
        
    } catch (error) {
        console.error('STK Push Error:', error.response?.data || error);
        res.status(500).json({
            success: false,
            message: 'Payment initiation failed',
            error: error.response?.data
        });
    }
});

// Callback endpoint (M-Pesa sends payment result here)
app.post('/api/mpesa/callback', (req, res) => {
    console.log('M-Pesa Callback:', JSON.stringify(req.body, null, 2));
    
    const { Body } = req.body;
    
    if (Body.stkCallback.ResultCode === 0) {
        // Payment successful
        console.log('✅ Payment successful!');
        
        // TODO: Update order status in database
        // TODO: Send confirmation SMS/email to customer
        // TODO: Notify admin
        
    } else {
        // Payment failed or canceled
        console.log('❌ Payment failed:', Body.stkCallback.ResultDesc);
    }
    
    // Always respond to Safaricom
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// Query transaction status
app.post('/api/mpesa/query', async (req, res) => {
    const { checkoutRequestID } = req.body;
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(SHORTCODE + PASSKEY + timestamp).toString('base64');
    
    try {
        const token = await getAccessToken();
        
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
            {
                BusinessShortCode: SHORTCODE,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestID
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        res.json(response.data);
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.response?.data
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

### Step 3: Create .env File

```env
# M-Pesa Credentials (from developer.safaricom.co.ke)
MPESA_CONSUMER_KEY=your_consumer_key_here
MPESA_CONSUMER_SECRET=your_consumer_secret_here
MPESA_PASSKEY=your_passkey_here
MPESA_SHORTCODE=174379  # Your paybill/till number

# Server Configuration
PORT=3000
CALLBACK_URL=https://yourdomain.com  # Must be publicly accessible (use ngrok for testing)

# For Production, use:
# https://api.safaricom.co.ke instead of sandbox
```

### Step 4: Update Frontend (checkout.html)

Replace the `processMpesaPayment` function:

```javascript
async function processMpesaPayment(orderData) {
    const modal = document.getElementById('processingModal');
    modal.classList.add('active');
    
    try {
        // Call your backend
        const response = await fetch('https://your-server.com/api/mpesa/stkpush', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phoneNumber: orderData.customer.phone,
                amount: orderData.payment.amount,
                orderId: orderData.orderId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Poll for payment status
            const checkResult = await pollPaymentStatus(data.checkoutRequestID);
            
            if (checkResult.success) {
                modal.classList.remove('active');
                saveOrder(orderData);
                alert(`✅ Payment Successful!\\n\\nOrder ID: ${orderData.orderId}`);
                localStorage.removeItem('cart');
                window.location.href = 'order-confirmation.html?orderId=' + orderData.orderId;
            } else {
                throw new Error('Payment was not completed');
            }
        } else {
            throw new Error(data.message || 'Payment initiation failed');
        }
        
    } catch (error) {
        modal.classList.remove('active');
        alert('Payment failed: ' + error.message + '\\n\\nPlease try again or choose another payment method.');
    }
}

async function pollPaymentStatus(checkoutRequestID) {
    // Poll every 2 seconds for up to 60 seconds
    for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            const response = await fetch('https://your-server.com/api/mpesa/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkoutRequestID })
            });
            
            const data = await response.json();
            
            if (data.ResultCode === '0') {
                return { success: true };
            } else if (data.ResultCode !== undefined && data.ResultCode !== '0') {
                return { success: false };
            }
            
        } catch (error) {
            console.error('Query error:', error);
        }
    }
    
    return { success: false };
}
```

---

## 🧪 Testing

### Sandbox Environment

Safaricom provides a sandbox for testing:

**Test Credentials**:
- **Phone**: Use any Safaricom number
- **PIN**: Enter any 4-digit number in sandbox
- **Amount**: Any amount works in sandbox

### Testing Checklist

- [ ] STK push received on phone
- [ ] Can complete payment with PIN
- [ ] Callback received on server
- [ ] Order status updated
- [ ] Confirmation sent to customer
- [ ] Admin notified

### Moving to Production

1. **Get production credentials** from https://developer.safaricom.co.ke/
2. **Change base URL** from `sandbox.safaricom.co.ke` to `api.safaricom.co.ke`
3. **Use real business shortcode** (Till/Paybill)
4. **Set up proper SSL** (HTTPS required)
5. **Configure production callback URL**
6. **Test with small amounts first**

---

## 💰 Costs & Fees

### M-Pesa Charges (Typical)

**For Paybill**:
- Setup fee: ~KSh 0-5,000
- Transaction fee: 0-2% (negotiable based on volume)
- Withdrawal fee: Per M-Pesa standard rates

**For Till Number**:
- Setup fee: Usually free
- Transaction fee: ~1%
- Withdrawal fee: Standard rates

### Daraja API

- **Sandbox**: FREE
- **Production**: FREE (you only pay M-Pesa transaction fees)

---

## 🔒 Security Best Practices

### 1. Never Expose API Keys

```javascript
// ❌ BAD - Keys in frontend
const CONSUMER_KEY = 'abc123';

// ✅ GOOD - Keys on backend
process.env.MPESA_CONSUMER_KEY
```

### 2. Validate Callbacks

```javascript
// Verify callback is from Safaricom
// Check IP whitelist
// Validate signature if provided
```

### 3. Use HTTPS

```javascript
// Both frontend and backend must use HTTPS
// Get free SSL from Let's Encrypt
```

### 4. Sanitize Inputs

```javascript
// Validate phone numbers
// Validate amounts (must be positive integer)
// Escape orderId and descriptions
```

### 5. Rate Limiting

```javascript
// Prevent abuse
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5 // 5 requests per 15 minutes
});

app.use('/api/mpesa', limiter);
```

---

## 🐛 Common Issues & Solutions

### Issue: "Invalid Access Token"

**Solution**:
- Check Consumer Key and Secret are correct
- Ensure no extra spaces in credentials
- Token expires after 1 hour - get new one

### Issue: "Invalid Shortcode"

**Solution**:
- Use correct shortcode for environment (sandbox vs production)
- Sandbox: Use test shortcode provided by Safaricom
- Production: Use your real Till/Paybill

### Issue: "Callback not received"

**Solution**:
- Ensure callback URL is publicly accessible
- Use ngrok for local testing: `ngrok http 3000`
- Check firewall/server allows POST requests
- Verify URL format: `https://yourdomain.com/api/mpesa/callback`

### Issue: "Transaction not found"

**Solution**:
- Wait a few seconds before querying
- Customer may have canceled on phone
- Check if STK push was actually sent

---

## 📱 Alternative: Manual M-Pesa

If you're not ready for API integration yet:

### Option 1: Manual Till Number

1. Get a Till Number from Safaricom
2. Customer selects "M-Pesa" at checkout
3. Show your Till Number: "Lipa Na M-Pesa → Buy Goods → Till Number: 123456"
4. Customer pays manually
5. Customer sends screenshot via WhatsApp
6. You confirm and process order

### Option 2: Paybill Manual

1. Show: "Paybill: 123456, Account: ORDER-ID"
2. Customer pays through M-Pesa menu
3. You receive notification
4. Confirm order

---

## 📊 Monitoring & Analytics

### Track These Metrics

```javascript
// Log all transactions
{
    orderId: 'KW12345',
    amount: 5000,
    phone: '254714243345',
    status: 'success|failed|pending',
    mpesaRef: 'ABC123XYZ',
    timestamp: '2026-11-02T18:00:00Z',
    errorMessage: null
}
```

### Send Alerts

```javascript
// Email admin on failed payments
// SMS customer on success
// Slack notification for high-value orders
```

---

## 🎓 Resources

### Official Documentation
- **Daraja API Docs**: https://developer.safaricom.co.ke/Documentation
- **API Explorer**: Test API calls directly
- **Support**: developer@safaricom.co.ke

### Community
- **GitHub**: Search "mpesa daraja nodejs"
- **Stack Overflow**: Tag "mpesa"
- **YouTube**: "Daraja API tutorial"

### Recommended Libraries

**Node.js**:
- `mpesa-node` - npm package
- `daraja` - npm package

**PHP**:
- `safaricom/mpesa` - Composer package

**Python**:
- `mpesa-python-sdk`

---

## ✅ Production Checklist

Before going live:

- [ ] Production Daraja API credentials obtained
- [ ] Backend server deployed (HTTPS)
- [ ] Environment variables configured
- [ ] Callback URL registered and working
- [ ] Database set up for orders
- [ ] Error logging configured
- [ ] SMS/Email notifications working
- [ ] Admin dashboard for monitoring
- [ ] Tested with real money (small amounts)
- [ ] Backup payment methods available (Cash, Bank)
- [ ] Customer support ready

---

## 💡 Pro Tips

1. **Start with Sandbox**: Test thoroughly before production
2. **Keep backup methods**: Cash and Bank transfer as alternatives
3. **Monitor closely**: First week, watch all transactions
4. **Customer support**: Many people call with payment issues
5. **Clear instructions**: Show steps for manual M-Pesa if API fails
6. **Timeout handling**: Don't wait forever for callback
7. **Reconciliation**: Daily check M-Pesa statement vs orders

---

## 📞 Support

**Safaricom Daraja Support**:
- Email: developer@safaricom.co.ke
- Phone: 0722 000 000

**Knight Watts Auto Parts**:
- Phone: +254 714 243 345
- Email: info@knightwatts.co.ke

---

**Your checkout is payment-ready! Set up Daraja API to accept M-Pesa! 🌙⚡💰**
