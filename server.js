require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting (works fine on Vercel)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. You can make 100 requests per 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'Message limit reached. You can send 50 messages per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.ip,
});

app.use('/api/', apiLimiter);
app.use('/api/chat', chatLimiter);

// Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Please type a message before sending.' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long. Max 5000 characters.' });
    }

    const chat = model.startChat({
      history: (history || []).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }))
    });

    const result = await chat.sendMessage(message);
    const reply = result.response.text();
    res.json({ reply });
  } catch (error) {
    console.error('Gemini error:', error);
    
    if (error.status === 429 || error.message?.includes('quota')) {
      return res.status(429).json({ 
        error: 'Our AI service is busy. Please try again in a moment.'
      });
    }
    
    res.status(500).json({ 
      error: 'I\'m having trouble responding. Please try again.'
    });
  }
});

// Serve frontend for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;