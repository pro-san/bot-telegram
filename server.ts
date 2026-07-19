import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { BotConfig, KeywordRule, AutoReplyLog, BotStats, DashboardData, BotMode } from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini API Client
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let ai: GoogleGenAI | null = null;

if (GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    console.log('Gemini API client initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Gemini API Client:', error);
  }
} else {
  console.warn('GEMINI_API_KEY is not defined in the environment. AI-powered replies will display an error.');
}

// In-Memory Chat History per user for multi-turn conversational AI replies
interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}
const chatHistories = new Map<string, ChatMessage[]>();

// Database Path
const DATA_FILE = path.join(__dirname, 'bot-data.json');

// Initialize Mock/Seeded Data
const getInitialStats = (): BotStats => {
  const dates = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dates.push({
      date: dateStr,
      received: Math.floor(Math.random() * 20) + 5,
      replies: 0, // Filled below
    });
  }

  // Pre-fill some realistic replies statistics
  dates.forEach(item => {
    item.replies = Math.max(0, item.received - Math.floor(Math.random() * 3));
  });

  const totalReceived = dates.reduce((sum, item) => sum + item.received, 0);
  const totalReplies = dates.reduce((sum, item) => sum + item.replies, 0);

  return {
    totalReceived,
    totalReplies,
    keywordMatches: Math.floor(totalReplies * 0.6),
    aiMatches: Math.floor(totalReplies * 0.4),
    failures: totalReceived - totalReplies,
    dailyChartData: dates,
  };
};

const getInitialData = (): DashboardData => {
  return {
    config: {
      token: '',
      mode: 'inactive',
      systemInstruction: 'You are a professional customer support assistant for a business. Keep your replies friendly, helpful, and concise (under three sentences). Answer customer queries directly.',
      isActive: false,
      webhookUrl: '',
      webhookStatus: 'unconfigured',
    },
    rules: [
      {
        id: 'rule-1',
        pattern: 'hello',
        replyContent: 'Hello! Thank you for contacting us. How can we assist you today?',
        matchType: 'contains',
        isActive: true,
        replyCount: 12,
      },
      {
        id: 'rule-2',
        pattern: 'pricing',
        replyContent: 'Our standard pricing plans are:\n• Starter: $9/mo\n• Growth: $29/mo\n• Enterprise: Custom\nYou can read details on our website!',
        matchType: 'contains',
        isActive: true,
        replyCount: 18,
      },
      {
        id: 'rule-3',
        pattern: 'hours',
        replyContent: 'We are open Monday through Friday, from 9:00 AM to 6:00 PM EST. We usually respond to inquiries within 2 hours during these times.',
        matchType: 'contains',
        isActive: true,
        replyCount: 8,
      },
    ],
    logs: [
      {
        id: 'log-1',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        senderId: 10482093,
        senderName: 'John Doe',
        senderUsername: 'johndoe',
        incomingMessage: 'Hi there, are you open today?',
        matchedRuleType: 'keyword',
        matchedRuleDetails: 'hello',
        replySent: 'Hello! Thank you for contacting us. How can we assist you today?',
        success: true,
      },
      {
        id: 'log-2',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        senderId: 23984029,
        senderName: 'Sarah Smith',
        senderUsername: 'sarah_smith',
        incomingMessage: 'What are your rates?',
        matchedRuleType: 'keyword',
        matchedRuleDetails: 'pricing',
        replySent: 'Our standard pricing plans are:\n• Starter: $9/mo\n• Growth: $29/mo\n• Enterprise: Custom\nYou can read details on our website!',
        success: true,
      },
    ],
    stats: getInitialStats(),
  };
};

// Load database state
let dbState: DashboardData = getInitialData();
if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    dbState = JSON.parse(raw);
    console.log('Database loaded from', DATA_FILE);
  } catch (error) {
    console.error('Failed to parse database file, starting fresh:', error);
  }
} else {
  fs.writeFileSync(DATA_FILE, JSON.stringify(dbState, null, 2));
  console.log('Created fresh database file at', DATA_FILE);
}

// Save database state helper
const saveDB = () => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(dbState, null, 2));
  } catch (error) {
    console.error('Failed to write database file:', error);
  }
};

// Update todays stats helper
const recordMessageReceived = (matchedType: 'keyword' | 'ai' | 'none', success: boolean) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Update total tallies
  dbState.stats.totalReceived += 1;
  if (success) {
    dbState.stats.totalReplies += 1;
    if (matchedType === 'keyword') dbState.stats.keywordMatches += 1;
    if (matchedType === 'ai') dbState.stats.aiMatches += 1;
  } else {
    dbState.stats.failures += 1;
  }

  // Update daily chart
  let todayEntry = dbState.stats.dailyChartData.find(item => item.date === dateStr);
  if (!todayEntry) {
    // Keep last 7 entries
    todayEntry = { date: dateStr, received: 0, replies: 0 };
    dbState.stats.dailyChartData.push(todayEntry);
    if (dbState.stats.dailyChartData.length > 7) {
      dbState.stats.dailyChartData.shift();
    }
  }
  todayEntry.received += 1;
  if (success) {
    todayEntry.replies += 1;
  }

  saveDB();
};

// Helper: Attempt to call Telegram API
async function callTelegram(method: string, token: string, body: any) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error(`Telegram API Call to ${method} failed:`, error);
    return { ok: false, error: error.message };
  }
}

// Helper: Setup/Teardown webhook
async function configureWebhook(token: string, active: boolean, customAppUrl?: string) {
  if (!token) return { success: false, error: 'No token provided' };

  if (!active) {
    console.log('Deactivating Telegram webhook...');
    const res = await callTelegram('deleteWebhook', token, {});
    return { success: res.ok, result: res };
  }

  // Determine App URL
  let targetUrl = process.env.APP_URL || customAppUrl || '';
  if (targetUrl.includes('MY_APP_URL') || !targetUrl) {
    // If we do not have an APP_URL, we cannot register the webhook
    return {
      success: false,
      error: 'Application public URL is not configured. Please define APP_URL in your server environment variables or pass it during saving.',
    };
  }

  // Ensure trailing slash removed
  if (targetUrl.endsWith('/')) {
    targetUrl = targetUrl.slice(0, -1);
  }

  const webhookUrl = `${targetUrl}/api/telegram-webhook`;
  console.log(`Registering Telegram webhook for URL: ${webhookUrl}`);

  const res = await callTelegram('setWebhook', token, {
    url: webhookUrl,
    allowed_updates: ['message'],
  });

  if (res.ok) {
    // Fetch bot details
    const meRes = await callTelegram('getMe', token, {});
    if (meRes.ok) {
      dbState.config.botUsername = meRes.result.username;
      dbState.config.botFirstName = meRes.result.first_name;
    }
    dbState.config.webhookUrl = webhookUrl;
    dbState.config.webhookStatus = 'connected';
    saveDB();
    return { success: true, result: res, botInfo: meRes.result };
  } else {
    dbState.config.webhookStatus = 'error';
    dbState.config.webhookError = res.description || 'Failed to register webhook';
    saveDB();
    return { success: false, error: res.description || 'Telegram setWebhook call failed' };
  }
}

// core auto reply matcher function
async function computeReply(
  senderIdStr: string,
  incomingText: string
): Promise<{ replyText: string; ruleType: 'keyword' | 'ai' | 'none'; ruleName?: string }> {
  const textNormalized = incomingText.trim();
  const textLower = textNormalized.toLowerCase();

  // 1. Keyword check
  if (dbState.config.mode === 'keywords' || dbState.config.mode === 'hybrid') {
    const activeRules = dbState.rules.filter(r => r.isActive);
    for (const rule of activeRules) {
      let isMatched = false;
      if (rule.matchType === 'exact') {
        isMatched = textLower === rule.pattern.trim().toLowerCase();
      } else if (rule.matchType === 'contains') {
        isMatched = textLower.includes(rule.pattern.trim().toLowerCase());
      } else if (rule.matchType === 'regex') {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          isMatched = regex.test(textNormalized);
        } catch (e) {
          console.error(`Invalid Regex pattern: ${rule.pattern}`, e);
        }
      }

      if (isMatched) {
        // Increment rule match counter
        rule.replyCount += 1;
        saveDB();
        return {
          replyText: rule.replyContent,
          ruleType: 'keyword',
          ruleName: rule.pattern,
        };
      }
    }
  }

  // 2. AI check
  if (dbState.config.mode === 'ai' || dbState.config.mode === 'hybrid') {
    if (!ai) {
      return {
        replyText: '⚠️ (AI Mode is enabled, but the server does not have a valid GEMINI_API_KEY. Please provide one in secrets.)',
        ruleType: 'none',
      };
    }

    try {
      // Manage multi-turn history
      let history = chatHistories.get(senderIdStr) || [];
      
      // Limit history to last 10 turns to avoid token inflation
      if (history.length > 20) {
        history = history.slice(history.length - 20);
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          ...history,
          { role: 'user', parts: [{ text: textNormalized }] },
        ],
        config: {
          systemInstruction: dbState.config.systemInstruction,
          temperature: 0.7,
        },
      });

      const replyText = response.text || "I'm sorry, I couldn't generate a reply.";
      
      // Append current turn to local history
      history.push({ role: 'user', parts: [{ text: textNormalized }] });
      history.push({ role: 'model', parts: [{ text: replyText }] });
      chatHistories.set(senderIdStr, history);

      return {
        replyText,
        ruleType: 'ai',
        ruleName: 'Gemini AI',
      };
    } catch (err: any) {
      console.error('Error calling Gemini API:', err);
      return {
        replyText: `⚠️ Error matching AI response: ${err.message || 'Unknown Gemini SDK failure'}`,
        ruleType: 'none',
      };
    }
  }

  // Inactive or unmatched
  return {
    replyText: '',
    ruleType: 'none',
  };
}

// 1. Webhook endpoint from Telegram
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200); // Telegram requests immediate 200 response

  const update = req.body;
  if (!update || !update.message || !update.message.text) {
    return;
  }

  const message = update.message;
  const senderId = message.chat.id;
  const text = message.text;
  const senderFirstName = message.from?.first_name || 'Anonymous';
  const senderLastName = message.from?.last_name || '';
  const senderName = `${senderFirstName} ${senderLastName}`.trim();
  const senderUsername = message.from?.username;

  console.log(`[Telegram Update] From: ${senderName} (${senderId}) Msg: "${text}"`);

  // If the bot is set to inactive, ignore
  if (dbState.config.mode === 'inactive' || !dbState.config.isActive) {
    return;
  }

  // Process the reply
  const { replyText, ruleType, ruleName } = await computeReply(String(senderId), text);

  if (replyText) {
    // Send message back to Telegram
    const telRes = await callTelegram('sendMessage', dbState.config.token, {
      chat_id: senderId,
      text: replyText,
    });

    const isSuccess = telRes.ok;
    const errorStr = telRes.ok ? undefined : (telRes.description || 'Unknown Telegram delivery error');

    // Add log entry
    const logEntry: AutoReplyLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      senderId,
      senderName,
      senderUsername: senderUsername || undefined,
      incomingMessage: text,
      matchedRuleType: ruleType,
      matchedRuleDetails: ruleName,
      replySent: replyText,
      success: isSuccess,
      error: errorStr,
    };

    dbState.logs.unshift(logEntry);
    if (dbState.logs.length > 100) {
      dbState.logs.pop(); // Cap history to 100 logs
    }

    // Update stats
    recordMessageReceived(ruleType, isSuccess);
  } else {
    // We received a message but sent no reply because no rules matched (and AI disabled)
    const logEntry: AutoReplyLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      senderId,
      senderName,
      senderUsername: senderUsername || undefined,
      incomingMessage: text,
      matchedRuleType: 'none',
      matchedRuleDetails: 'No rule matched',
      success: true,
    };
    dbState.logs.unshift(logEntry);
    recordMessageReceived('none', false);
  }
});

// 2. Fetch Full Dashboard data
app.get('/api/dashboard', (req, res) => {
  res.json({
    config: dbState.config,
    rules: dbState.rules,
    logs: dbState.logs,
    stats: dbState.stats,
    geminiConfigured: !!GEMINI_API_KEY,
  });
});

// 3. Save Configuration
app.post('/api/config', async (req, res) => {
  const { token, mode, systemInstruction, isActive, browserUrl } = req.body;

  const previousToken = dbState.config.token;
  const previousMode = dbState.config.mode;
  const previousActiveState = dbState.config.isActive;

  dbState.config.token = token !== undefined ? token : dbState.config.token;
  dbState.config.mode = mode !== undefined ? mode : dbState.config.mode;
  dbState.config.systemInstruction = systemInstruction !== undefined ? systemInstruction : dbState.config.systemInstruction;
  dbState.config.isActive = isActive !== undefined ? isActive : dbState.config.isActive;

  // Save changes to database
  saveDB();

  let webhookResult: any = null;

  // Detect token configuration/activation changes to trigger webhook set/delete
  const tokenChanged = dbState.config.token !== previousToken;
  const activationChanged = dbState.config.isActive !== previousActiveState || dbState.config.mode !== previousMode;

  if (dbState.config.token && dbState.config.isActive && dbState.config.mode !== 'inactive') {
    // Register Webhook
    if (tokenChanged || activationChanged || !dbState.config.webhookUrl) {
      const hookRes = await configureWebhook(dbState.config.token, true, browserUrl);
      webhookResult = hookRes;
    }
  } else if (previousToken && (!dbState.config.isActive || dbState.config.mode === 'inactive')) {
    // Delete Webhook if it was previously set and is now deactivated
    const hookRes = await configureWebhook(previousToken, false);
    webhookResult = hookRes;
    dbState.config.webhookStatus = 'unconfigured';
    dbState.config.webhookUrl = '';
    saveDB();
  }

  res.json({
    success: true,
    config: dbState.config,
    webhookResult,
  });
});

// 4. Save/Update Keyword Rules
app.post('/api/rules', (req, res) => {
  const { rules } = req.body;
  if (Array.isArray(rules)) {
    dbState.rules = rules;
    saveDB();
    res.json({ success: true, rules: dbState.rules });
  } else {
    res.status(400).json({ success: false, error: 'Rules must be an array' });
  }
});

// 5. Toggle Rule Active Status
app.post('/api/rules/toggle', (req, res) => {
  const { id } = req.body;
  const rule = dbState.rules.find(r => r.id === id);
  if (rule) {
    rule.isActive = !rule.isActive;
    saveDB();
    res.json({ success: true, rule });
  } else {
    res.status(404).json({ success: false, error: 'Rule not found' });
  }
});

// 6. Simulated Test Message (Sandbox)
app.post('/api/test-message', async (req, res) => {
  const { text, resetSession } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text content is required' });
  }

  if (resetSession) {
    chatHistories.delete('sandbox');
  }

  const { replyText, ruleType, ruleName } = await computeReply('sandbox', text);

  // Log simulation to stats/logs if active
  const isReplyGenerated = !!replyText;
  const logEntry: AutoReplyLog = {
    id: `sim-log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    senderId: 0,
    senderName: 'Sandbox Simulator',
    incomingMessage: text,
    matchedRuleType: ruleType,
    matchedRuleDetails: ruleName || 'No Match',
    replySent: replyText || '(No Auto-Reply triggered)',
    success: true,
  };

  // Prepend simulator log to active history
  dbState.logs.unshift(logEntry);
  if (dbState.logs.length > 100) {
    dbState.logs.pop();
  }

  recordMessageReceived(ruleType, isReplyGenerated);

  res.json({
    reply: replyText,
    matchedRuleType: ruleType,
    matchedRuleDetails: ruleName,
    history: chatHistories.get('sandbox') || [],
  });
});

// 7. Clear Logs
app.post('/api/logs/clear', (req, res) => {
  dbState.logs = [];
  saveDB();
  res.json({ success: true });
});

// 8. Reset Statistics
app.post('/api/stats/reset', (req, res) => {
  dbState.stats = {
    totalReceived: 0,
    totalReplies: 0,
    keywordMatches: 0,
    aiMatches: 0,
    failures: 0,
    dailyChartData: getInitialStats().dailyChartData.map(item => ({ ...item, received: 0, replies: 0 })),
  };
  saveDB();
  res.json({ success: true, stats: dbState.stats });
});

// Integration of Vite Dev Middleware / Static assets
const setupServerAndVite = async () => {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite development middlewares loaded.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving production build from:', distPath);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telegram Bot Server running on http://localhost:${PORT}`);
  });
};

setupServerAndVite().catch(err => {
  console.error('Error starting server:', err);
});
