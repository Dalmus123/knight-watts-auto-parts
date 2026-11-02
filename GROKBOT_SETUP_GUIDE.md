# 🤖 Grokbot Integration Guide for Knight Watts Auto Parts

## Overview

Your website has a built-in AI chat assistant powered by Grokbot (x.ai). It currently runs in **demo mode** with pre-programmed responses. This guide shows you how to connect your real Grokbot agent for full AI capabilities.

---

## 🎯 Current Status

**✅ Demo Mode Active**
- The chat widget works with fallback responses
- Customers can still chat and get basic help
- Limited to pre-programmed answers

**🚀 To Enable Full AI:**
- Connect your x.ai Grokbot API
- Get real-time AI responses
- Multilingual support (English & Swahili)
- Smart product recommendations
- Natural conversation handling

---

## 📋 Step-by-Step Setup

### Step 1: Get Your Grokbot API Key

1. **Visit x.ai Console**: Go to https://console.x.ai/

2. **Sign In / Create Account**:
   - Use your existing x.ai account
   - Or create a new one

3. **Navigate to API Keys**:
   - Click on "API Keys" in the sidebar
   - Or go directly to: https://console.x.ai/api-keys

4. **Create New API Key**:
   - Click "Create API Key"
   - Give it a name: `Knight Watts Auto Parts`
   - Copy the key (starts with `xai-...`)
   - **IMPORTANT**: Save it securely! You won't see it again.

### Step 2: Add the API Key to Your Website

#### Option A: Edit File Directly (Recommended)

1. **Open the file**: `ai-chat-widget.js`

2. **Find this line** (around line 476):
```javascript
const GROKBOT_API_KEY = null; // Change to 'xai-YOUR-KEY-HERE' for production
```

3. **Replace with your key**:
```javascript
const GROKBOT_API_KEY = 'xai-aBcDeFgH1234567890'; // Your actual key
```

4. **Save the file**

5. **Commit and push to GitHub**:
```bash
git add ai-chat-widget.js
git commit -m "Enable Grokbot with API key"
git push origin main
```

#### Option B: Use Environment Variable (More Secure)

If you're using a server or build system:

```javascript
const GROKBOT_API_KEY = process.env.GROKBOT_API_KEY || null;
```

Then set the environment variable on your hosting platform.

### Step 3: Test the Integration

1. **Wait 2-3 minutes** for GitHub Pages to rebuild

2. **Open your website**: https://dalmus123.github.io/home-coach/

3. **Click the chat icon** (bottom right)

4. **Send a test message**: "Habari, nataka brake pads"

5. **Check for AI response**:
   - ✅ Real AI: Personalized, contextual response
   - ❌ Demo mode: Generic pre-programmed response

### Step 4: Verify in Console

Open browser console (F12) and look for:
- `Grokbot initialized in PRODUCTION mode` ✅
- `Grokbot initialized in DEMO mode` ❌ (means no API key)

---

## 🔒 Security Best Practices

### ⚠️ Important Security Notes:

1. **Never commit API keys to public repos**
   - Your repo is public, so API keys in code are visible
   - Consider using GitHub Secrets + GitHub Actions
   - Or move to a backend server

2. **For Production Sites**:
   - Use a backend proxy server
   - Store API keys server-side
   - Frontend calls your server, server calls Grokbot

3. **Rate Limiting**:
   - Monitor x.ai usage dashboard
   - Set up rate limits
   - Implement caching for common questions

### Better Architecture (Recommended):

```
User Browser → Your Server → x.ai Grokbot API
              (API key here)
```

This keeps your API key secure and hidden from users.

---

## 💰 Grokbot Pricing

**x.ai API Pricing** (as of 2026):

- **Free Tier**: 
  - Limited requests per month
  - Good for testing

- **Paid Tiers**:
  - Pay per token
  - Volume discounts available
  - Check: https://x.ai/pricing

**Monitor your usage**:
- Dashboard: https://console.x.ai/usage
- Set up billing alerts
- Track costs per conversation

---

## 🎨 Customizing Grokbot

### Customize the System Prompt

**File**: `grokbot.js` (line 16-40)

Current prompt includes:
- ✅ Knight Watts branding
- ✅ Product knowledge
- ✅ English & Swahili support
- ✅ Business hours and locations

**To modify**:
```javascript
this.systemPrompt = `You are an AI assistant for Knight Watts Auto Parts...
Add your custom instructions here...
`;
```

### Add Product Knowledge

Products are automatically loaded from `app.js`:
```javascript
this.products = window.products || [];
```

Grokbot already knows about all 12 products in your catalog!

### Customize Responses

Edit the `generateDemoResponse()` method in `grokbot.js` to change fallback responses.

---

## 🧪 Testing Checklist

Before going live with real Grokbot:

- [ ] API key added and working
- [ ] Test in English: "I need brake pads for Toyota"
- [ ] Test in Swahili: "Nataka spare parts za Nissan"
- [ ] Test product search: "What do you have for Mitsubishi?"
- [ ] Test location: "Is it available in Embu?"
- [ ] Test pricing: "How much is the alternator?"
- [ ] Test on mobile devices
- [ ] Check console for errors
- [ ] Monitor x.ai usage dashboard

---

## 🐛 Troubleshooting

### Issue: Still seeing demo responses

**Solutions**:
1. Check API key format: starts with `xai-`
2. Verify no spaces before/after key
3. Check browser console for errors
4. Clear browser cache and refresh
5. Wait for GitHub Pages rebuild (2-3 min)

### Issue: "API key invalid" error

**Solutions**:
1. Regenerate key at https://console.x.ai/api-keys
2. Check key hasn't expired
3. Verify account is active
4. Check billing status

### Issue: Slow responses

**Solutions**:
1. Check x.ai status: https://status.x.ai/
2. Verify internet connection
3. Monitor rate limits
4. Consider caching common responses

### Issue: High costs

**Solutions**:
1. Implement rate limiting
2. Cache common questions
3. Optimize system prompt length
4. Set conversation history limit
5. Use less verbose responses

---

## 📞 Support

### x.ai Support
- Docs: https://docs.x.ai/
- Support: https://x.ai/support
- Status: https://status.x.ai/

### Knight Watts Auto Parts
- Phone: +254 714 243 345
- Email: info@knightwatts.co.ke

---

## 🚀 Advanced Features

### WhatsApp Integration

Connect Grokbot to WhatsApp Business API:
1. Get WhatsApp Business account
2. Set up webhook to receive messages
3. Forward to Grokbot API
4. Send responses back via WhatsApp

### SMS Integration

Use services like Africa's Talking:
```javascript
// Receive SMS
africastalking.SMS.on('incoming', async (sms) => {
    const response = await grokbot.chat(sms.text);
    // Send response via SMS
});
```

### Voice Integration

Use speech-to-text + Grokbot + text-to-speech:
1. Google Speech API → text
2. Grokbot API → response
3. Google Text-to-Speech → audio

---

## 📊 Analytics & Monitoring

### Track Conversations

Add logging to `grokbot.js`:
```javascript
async chat(userMessage) {
    // Log to analytics
    gtag('event', 'chat_message', {
        'message_length': userMessage.length,
        'timestamp': Date.now()
    });
    
    // ... rest of code
}
```

### Monitor Key Metrics
- Total conversations
- Average response time
- User satisfaction
- Common questions
- Conversion rate

---

## ✅ Quick Reference

### File Locations
- **Grokbot Class**: `grokbot.js`
- **Chat Widget**: `ai-chat-widget.js`
- **Chat Styles**: `ai-chat-widget.css`
- **API Key Location**: Line 476 in `ai-chat-widget.js`

### Important URLs
- **x.ai Console**: https://console.x.ai/
- **API Keys**: https://console.x.ai/api-keys
- **Documentation**: https://docs.x.ai/
- **Your Website**: https://dalmus123.github.io/home-coach/

### Key Commands
```bash
# Add API key
nano ai-chat-widget.js

# Commit changes
git add ai-chat-widget.js
git commit -m "Enable Grokbot"
git push origin main

# View logs
# Open browser console (F12)
```

---

## 🎓 Next Steps

1. ✅ Get x.ai API key
2. ✅ Add to `ai-chat-widget.js`
3. ✅ Test with real queries
4. ✅ Monitor usage and costs
5. ✅ Customize system prompt
6. ✅ Add more product knowledge
7. ✅ Integrate with WhatsApp/SMS
8. ✅ Set up analytics

**Your Grokbot is ready to serve Knight Watts Auto Parts customers! 🌙⚡**
