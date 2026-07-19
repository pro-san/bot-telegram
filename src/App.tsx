import { useState, useEffect, useRef, FormEvent, MouseEvent } from 'react';
import {
  Bot,
  Send,
  Key,
  HelpCircle,
  Activity,
  FileText,
  CheckCircle,
  AlertCircle,
  Trash2,
  Plus,
  RefreshCw,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Database,
  Sliders,
  ShieldAlert,
  Terminal,
  ExternalLink,
  MessageSquare,
  Info,
  Download,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Search,
  Users
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { BotConfig, KeywordRule, AutoReplyLog, BotStats } from './types';

const PERSONALITY_TEMPLATES = [
  {
    name: 'Formal Support',
    value: 'You are a professional customer support assistant for a business. Keep your replies friendly, polite, informative, and structured. Answer customer queries with complete sentences, avoiding slang and keeping a polished business tone.'
  },
  {
    name: 'Casual / Friendly',
    value: 'You are a warm, casual, and incredibly friendly support assistant. Speak to users as if they are your close friends! Use occasional relevant emojis, keep things lighthearted and supportive, and make sure they feel welcome.'
  },
  {
    name: 'Concise Expert',
    value: 'You are an expert technical support assistant. Provide extremely direct, highly concise, and accurate answers. Do not waste words on pleasantries; get straight to the point and provide actionable, clear steps.'
  }
];

export default function App() {
  // Config state
  const [config, setConfig] = useState<BotConfig>({
    token: '',
    mode: 'inactive',
    systemInstruction: '',
    isActive: false,
    webhookUrl: '',
    webhookStatus: 'unconfigured',
  });

  // Rules, Logs, and Stats states
  const [rules, setRules] = useState<KeywordRule[]>([]);
  const [logs, setLogs] = useState<AutoReplyLog[]>([]);
  const [stats, setStats] = useState<BotStats>({
    totalReceived: 0,
    totalReplies: 0,
    keywordMatches: 0,
    aiMatches: 0,
    failures: 0,
    dailyChartData: [],
  });

  // UI state
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [savingRule, setSavingRule] = useState<boolean>(false);
  const [actionStatus, setActionStatus] = useState<{ message: string; type: 'success' | 'error' | null }>({
    message: '',
    type: null,
  });

  // Test sandbox simulator states
  const [sandboxInput, setSandboxInput] = useState<string>('');
  const [sandboxMessages, setSandboxMessages] = useState<Array<{ sender: 'user' | 'bot' | 'system'; text: string; matchedDetails?: string; timestamp: Date }>>([
    { sender: 'system', text: 'Welcome to the Bot Simulator Sandbox. Send a message to test your active keyword rules and Gemini AI instructions instantly!', timestamp: new Date() }
  ]);
  const [sendingSandbox, setSendingSandbox] = useState<boolean>(false);

  // New Rule form states
  const [newRulePattern, setNewRulePattern] = useState<string>('');
  const [newRuleReply, setNewRuleReply] = useState<string>('');
  const [newRuleMatchType, setNewRuleMatchType] = useState<'exact' | 'contains' | 'regex'>('contains');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [showRuleForm, setShowRuleForm] = useState<boolean>(false);

  // Expanded log IDs for execution logs detail view
  const [expandedLogIds, setExpandedLogIds] = useState<string[]>([]);

  // Auto-polling state for keeping logs and stats updated
  const [autoPoll, setAutoPoll] = useState<boolean>(false);

  // Copied log ID state for temporary "Copied!" feedback
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  // Search filter query for live execution logs
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');

  // Group log entries by sender
  const [groupBySender, setGroupBySender] = useState<boolean>(false);
  // Expanded group IDs when grouping is enabled
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);

  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((item) => item !== groupId) : [...prev, groupId]
    );
  };

  const handleToggleGroupBySender = () => {
    const newGroupBySender = !groupBySender;
    setGroupBySender(newGroupBySender);
    if (newGroupBySender) {
      // Auto expand all sender groups on activation
      const keys = Array.from(new Set(filteredLogs.map(log => 
        log.senderId !== undefined && log.senderId !== null ? String(log.senderId) : (log.senderName || 'Unknown')
      )));
      setExpandedGroupIds(keys);
    }
  };

  const copyLogToClipboard = (e: MouseEvent, logId: string, logContent: any) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(logContent, null, 2)).then(() => {
      setCopiedLogId(logId);
      setTimeout(() => setCopiedLogId(null), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  // Scroll ref for chat simulator
  const chatEndRef = useRef<HTMLDivElement>(null);

  const toggleLogExpansion = (id: string) => {
    setExpandedLogIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Fetch initial dashboard state
  const fetchDashboardData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const data = await res.json();
        if (!silent) {
          setConfig(data.config);
        }
        setRules(data.rules);
        setLogs(data.logs);
        setStats(data.stats);
        setGeminiConfigured(data.geminiConfigured);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      if (!silent) {
        showBanner('Failed to load bot server data. Ensure the server is running.', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Interval hook for auto-polling logs/stats every 5 seconds
  useEffect(() => {
    if (!autoPoll) return;

    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [autoPoll]);

  // Auto-scroll sandbox chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sandboxMessages]);

  const showBanner = (message: string, type: 'success' | 'error') => {
    setActionStatus({ message, type });
    setTimeout(() => {
      setActionStatus({ message: '', type: null });
    }, 4500);
  };

  // Save Config
  const handleSaveConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: config.token,
          mode: config.mode,
          systemInstruction: config.systemInstruction,
          isActive: config.isActive,
          browserUrl: window.location.origin, // Sends client url to assist webhook setup
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        if (data.webhookResult && !data.webhookResult.success) {
          showBanner(`Config saved, but webhook setup had an issue: ${data.webhookResult.error}`, 'error');
        } else if (data.webhookResult && data.webhookResult.success) {
          showBanner(`Successfully saved configuration and registered Telegram Webhook! Connected to @${data.config.botUsername || 'bot'}.`, 'success');
        } else {
          showBanner('Configuration saved successfully.', 'success');
        }
        fetchDashboardData(); // Refresh logs and webhook status
      } else {
        showBanner(data.error || 'Failed to save configuration.', 'error');
      }
    } catch (err) {
      console.error(err);
      showBanner('Network error saving configuration.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // Save or Edit Rule
  const handleSaveRule = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRulePattern.trim() || !newRuleReply.trim()) {
      showBanner('Please fill in both rule trigger and reply content.', 'error');
      return;
    }

    setSavingRule(true);
    let updatedRules = [...rules];

    if (editingRuleId) {
      updatedRules = updatedRules.map(rule =>
        rule.id === editingRuleId
          ? {
              ...rule,
              pattern: newRulePattern,
              replyContent: newRuleReply,
              matchType: newRuleMatchType,
            }
          : rule
      );
      showBanner('Auto-reply rule updated successfully.', 'success');
    } else {
      const newRule: KeywordRule = {
        id: `rule-${Date.now()}`,
        pattern: newRulePattern,
        replyContent: newRuleReply,
        matchType: newRuleMatchType,
        isActive: true,
        replyCount: 0,
      };
      updatedRules.push(newRule);
      showBanner('New auto-reply rule added successfully!', 'success');
    }

    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: updatedRules }),
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules);
        resetRuleForm();
      }
    } catch (err) {
      console.error(err);
      showBanner('Failed to synchronize rules with backend.', 'error');
    } finally {
      setSavingRule(false);
    }
  };

  const resetRuleForm = () => {
    setNewRulePattern('');
    setNewRuleReply('');
    setNewRuleMatchType('contains');
    setEditingRuleId(null);
    setShowRuleForm(false);
  };

  const handleEditRule = (rule: KeywordRule) => {
    setNewRulePattern(rule.pattern);
    setNewRuleReply(rule.replyContent);
    setNewRuleMatchType(rule.matchType);
    setEditingRuleId(rule.id);
    setShowRuleForm(true);
  };

  // Toggle Rule Status
  const handleToggleRule = async (id: string) => {
    try {
      const res = await fetch('/api/rules/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const data = await res.json();
        setRules(rules.map(r => (r.id === id ? data.rule : r)));
        showBanner(`Rule status toggled.`, 'success');
      }
    } catch (err) {
      console.error(err);
      showBanner('Error toggling rule status.', 'error');
    }
  };

  // Delete Rule
  const handleDeleteRule = async (id: string) => {
    const updatedRules = rules.filter(r => r.id !== id);
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: updatedRules }),
      });
      if (res.ok) {
        setRules(updatedRules);
        showBanner('Rule deleted successfully.', 'success');
      }
    } catch (err) {
      console.error(err);
      showBanner('Error deleting rule.', 'error');
    }
  };

  // Toggle Bot Activation Quick Status
  const handleQuickToggleActive = async () => {
    const nextActiveState = !config.isActive;
    setConfig({ ...config, isActive: nextActiveState });
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActiveState }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        showBanner(`Telegram Bot Auto-Responder is now ${nextActiveState ? 'ENABLED' : 'DISABLED'}.`, 'success');
        fetchDashboardData();
      }
    } catch (err) {
      console.error(err);
      showBanner('Failed to toggle bot activation state.', 'error');
    }
  };

  // Send test message in sandbox
  const handleSendSandboxMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!sandboxInput.trim()) return;

    const userMsgText = sandboxInput;
    setSandboxInput('');
    setSendingSandbox(true);

    // Append user message immediately
    setSandboxMessages(prev => [
      ...prev,
      { sender: 'user', text: userMsgText, timestamp: new Date() }
    ]);

    try {
      const res = await fetch('/api/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userMsgText }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          setSandboxMessages(prev => [
            ...prev,
            {
              sender: 'bot',
              text: data.reply,
              matchedDetails: data.matchedRuleDetails
                ? `Matched: ${data.matchedRuleType === 'keyword' ? 'Keyword' : 'AI'} "${data.matchedRuleDetails}"`
                : undefined,
              timestamp: new Date()
            }
          ]);
        } else {
          setSandboxMessages(prev => [
            ...prev,
            { sender: 'system', text: '⚠️ Message received but no auto-reply matched. Change Bot Mode to AI or define more keywords.', timestamp: new Date() }
          ]);
        }
        // Refresh logs/stats since simulator records logs
        const dashRes = await fetch('/api/dashboard');
        if (dashRes.ok) {
          const dashData = await dashRes.json();
          setLogs(dashData.logs);
          setStats(dashData.stats);
        }
      } else {
        const errData = await res.json();
        setSandboxMessages(prev => [
          ...prev,
          { sender: 'system', text: `⚠️ Simulator Error: ${errData.error || 'Server error'}`, timestamp: new Date() }
        ]);
      }
    } catch (err) {
      console.error(err);
      setSandboxMessages(prev => [
        ...prev,
        { sender: 'system', text: '⚠️ Connection failed to simulator backend.', timestamp: new Date() }
      ]);
    } finally {
      setSendingSandbox(false);
    }
  };

  // Clear simulator chat
  const handleClearSandbox = async () => {
    try {
      await fetch('/api/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'reset', resetSession: true }),
      });
      setSandboxMessages([
        { sender: 'system', text: 'Simulator sandbox reset. Conversational history with Gemini cleared.', timestamp: new Date() }
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  // Clear Execution Logs
  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all log history?')) return;
    try {
      const res = await fetch('/api/logs/clear', { method: 'POST' });
      if (res.ok) {
        setLogs([]);
        showBanner('Audit logs cleared.', 'success');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Download Logs as JSON
  const handleDownloadJSON = () => {
    if (logs.length === 0) {
      showBanner('No logs available to download.', 'error');
      return;
    }
    const dataStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `telegram-bot-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showBanner('Logs downloaded as JSON.', 'success');
  };

  // Download Logs as CSV
  const handleDownloadCSV = () => {
    if (logs.length === 0) {
      showBanner('No logs available to download.', 'error');
      return;
    }

    // CSV Headers
    const headers = ['ID', 'Timestamp', 'Sender ID', 'Sender Name', 'Sender Username', 'Incoming Message', 'Matched Rule Type', 'Matched Rule Details', 'Reply Sent', 'Success', 'Error'];

    // Create rows
    const rows = logs.map(log => [
      log.id,
      log.timestamp,
      log.senderId,
      log.senderName || '',
      log.senderUsername || '',
      `"${(log.incomingMessage || '').replace(/"/g, '""')}"`,
      log.matchedRuleType,
      `"${(log.matchedRuleDetails || '').replace(/"/g, '""')}"`,
      `"${(log.replySent || '').replace(/"/g, '""')}"`,
      log.success ? 'TRUE' : 'FALSE',
      `"${(log.error || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `telegram-bot-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showBanner('Logs downloaded as CSV.', 'success');
  };

  // Reset Stats
  const handleResetStats = async () => {
    if (!window.confirm('Are you sure you want to reset all bot statistics? This resets counters to 0.')) return;
    try {
      const res = await fetch('/api/stats/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        showBanner('Counters and statistics reset.', 'success');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filter logs based on search query
  const filteredLogs = logs.filter(log => {
    if (!logSearchQuery) return true;
    const q = logSearchQuery.toLowerCase();
    const nameMatch = (log.senderName || '').toLowerCase().includes(q);
    const usernameMatch = (log.senderUsername || '').toLowerCase().includes(q);
    const msgMatch = (log.incomingMessage || '').toLowerCase().includes(q);
    const replyMatch = (log.replySent || '').toLowerCase().includes(q);
    const ruleMatch = (log.matchedRuleDetails || '').toLowerCase().includes(q);
    const errorMatch = (log.error || '').toLowerCase().includes(q);
    const typeMatch = (log.matchedRuleType || '').toLowerCase().includes(q);
    return nameMatch || usernameMatch || msgMatch || replyMatch || ruleMatch || errorMatch || typeMatch;
  });

  // Group logs by sender if active
  const groupedLogsList = (() => {
    if (!groupBySender) return [];
    
    const groupsMap = new Map<string, {
      senderId: string | number;
      senderName: string;
      senderUsername?: string;
      logs: AutoReplyLog[];
      latestTimestamp: string;
    }>();
    
    filteredLogs.forEach(log => {
      const key = log.senderId !== undefined && log.senderId !== null ? String(log.senderId) : (log.senderName || 'Unknown');
      
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          senderId: log.senderId,
          senderName: log.senderName || 'Unknown Sender',
          senderUsername: log.senderUsername,
          logs: [],
          latestTimestamp: log.timestamp
        });
      }
      
      const grp = groupsMap.get(key)!;
      grp.logs.push(log);
      
      if (new Date(log.timestamp) > new Date(grp.latestTimestamp)) {
        grp.latestTimestamp = log.timestamp;
      }
    });
    
    return Array.from(groupsMap.values()).sort((a, b) => 
      new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime()
    );
  })();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Banner Alert / Action Banner */}
      <AnimatePresence>
        {actionStatus.message && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-lg border ${
              actionStatus.type === 'success'
                ? 'bg-zinc-900/95 text-emerald-400 border-emerald-500/30'
                : 'bg-zinc-900/95 text-rose-400 border-rose-500/30'
            }`}
          >
            {actionStatus.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            )}
            <p className="text-sm font-medium">{actionStatus.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        
        {/* Header Block */}
        <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800/60 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600/10 rounded-xl border border-indigo-500/20 text-indigo-400 shadow-inner">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">Telegram Auto-Reply Bot</h1>
                <span className="px-2 py-0.5 text-xs bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20 font-mono">v1.2 Full-Stack</span>
              </div>
              <p className="text-zinc-400 text-sm mt-0.5">Host and manage your own intelligent Telegram bot using rules and Gemini AI.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap md:flex-nowrap w-full md:w-auto">
            {/* Quick Status indicators */}
            <div className="flex flex-col text-right items-end gap-1 px-4 py-2 bg-zinc-950/60 rounded-xl border border-zinc-800/80 w-full sm:w-auto">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
                Webhook:
                <span className={`font-semibold capitalize font-mono ${
                  config.webhookStatus === 'connected' ? 'text-emerald-400' :
                  config.webhookStatus === 'error' ? 'text-rose-400' : 'text-zinc-500'
                }`}>
                  {config.webhookStatus}
                </span>
              </div>
              {config.botUsername && (
                <a
                  href={`https://t.me/${config.botUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 font-mono"
                >
                  @{config.botUsername} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Quick Master Switch */}
            <button
              onClick={handleQuickToggleActive}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl font-medium transition-all cursor-pointer select-none w-full sm:w-auto justify-center ${
                config.isActive
                  ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                  : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800 border border-zinc-700/60'
              }`}
            >
              {config.isActive ? (
                <>
                  <ToggleRight className="w-6 h-6 text-emerald-400" />
                  <span>Bot is Active</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-6 h-6 text-zinc-500" />
                  <span>Bot is Paused</span>
                </>
              )}
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/20 rounded-2xl border border-zinc-900">
            <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
            <p className="text-zinc-400">Synchronizing bot systems...</p>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* MAIN ROW: CONFIG (LEFT) & TEST SANDBOX (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* CONFIG CARD (LEFT - 5 columns) */}
              <div className="lg:col-span-5 flex flex-col">
                <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 p-6 flex-1 flex flex-col justify-between backdrop-blur-sm shadow-xl">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Sliders className="w-5 h-5 text-indigo-400" />
                      <h2 className="text-lg font-bold text-white">Bot Operations & Config</h2>
                    </div>

                    <form onSubmit={handleSaveConfig} className="space-y-5">
                      
                      {/* Telegram Bot Token input */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-indigo-400" />
                          Telegram Bot Token
                        </label>
                        <div className="relative">
                          <input
                            type="password"
                            placeholder="e.g. 1234567890:ABCdefGhIJKlmNoPQRsT..."
                            value={config.token}
                            onChange={(e) => setConfig({ ...config, token: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/10 text-zinc-100 transition-all font-mono"
                          />
                        </div>
                        <p className="text-zinc-500 text-[11px] mt-1.5 flex items-center gap-1">
                          <Info className="w-3 h-3 text-zinc-400" />
                          Acquire from Telegram's <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">@BotFather</a>
                        </p>
                      </div>

                      {/* Mode selection button group */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                          Auto-Reply Execution Mode
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2">
                          {[
                            { id: 'inactive', label: 'Inactive', desc: 'Silence replies' },
                            { id: 'keywords', label: 'Keywords Only', desc: 'Pre-set replies' },
                            { id: 'ai', label: 'Gemini AI Only', desc: 'Intelligent AI' },
                            { id: 'hybrid', label: 'Hybrid Mode', desc: 'Keywords + AI fallback' },
                          ].map((modeItem) => (
                            <button
                              key={modeItem.id}
                              type="button"
                              onClick={() => setConfig({ ...config, mode: modeItem.id as any })}
                              className={`px-3 py-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                                config.mode === modeItem.id
                                  ? 'bg-indigo-600/10 border-indigo-500/60 text-white ring-2 ring-indigo-500/10'
                                  : 'bg-zinc-950/40 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-300'
                              }`}
                            >
                              <div className="text-sm font-semibold">{modeItem.label}</div>
                              <div className="text-[10px] text-zinc-500 font-normal mt-0.5">{modeItem.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Gemini System Instruction context box (conditional) */}
                      {(config.mode === 'ai' || config.mode === 'hybrid') && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-3 border-t border-zinc-800/60 pt-4"
                        >
                          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                              AI Assistant Personality
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">Models/gemini-3.5-flash</span>
                          </label>

                          {!geminiConfigured && (
                            <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl p-3 text-xs flex items-start gap-2 mb-2">
                              <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
                              <p>
                                <strong>API Key Missing:</strong> Your server's <code>GEMINI_API_KEY</code> is not loaded. Gemini auto-replies will prompt connection issues until the secret is added in <strong>Secrets</strong>.
                              </p>
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl">
                            <span className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                              Apply Personality Template:
                            </span>
                            <select
                              value={
                                PERSONALITY_TEMPLATES.find(t => t.value === config.systemInstruction)?.value || ""
                              }
                              onChange={(e) => {
                                if (e.target.value) {
                                  setConfig({ ...config, systemInstruction: e.target.value });
                                  showBanner(`Applied '${PERSONALITY_TEMPLATES.find(t => t.value === e.target.value)?.name}' template.`, 'success');
                                }
                              }}
                              className="bg-zinc-900 text-zinc-300 text-xs rounded-lg border border-zinc-800 px-2.5 py-1.5 focus:outline-none focus:border-indigo-500/80 transition-all cursor-pointer min-w-[150px] font-medium"
                            >
                              <option value="" disabled>-- Select a template --</option>
                              {PERSONALITY_TEMPLATES.map((template) => (
                                <option key={template.name} value={template.value}>
                                  {template.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <textarea
                            placeholder="e.g. You are a tech-savvy support bot for a software product. Be helpful, concise, and use occasional emojis."
                            value={config.systemInstruction}
                            onChange={(e) => setConfig({ ...config, systemInstruction: e.target.value })}
                            rows={4}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/10 text-zinc-100 transition-all resize-none"
                          />
                          <p className="text-zinc-500 text-[10px]">
                            Define exactly how the bot should behave, who it represents, and guidelines like reply length, tone, or language constraint.
                          </p>
                        </motion.div>
                      )}

                      <button
                        type="submit"
                        disabled={savingConfig}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700/50 text-white font-medium py-3 px-4 rounded-xl shadow-lg hover:shadow-indigo-500/10 hover:shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
                      >
                        {savingConfig ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Saving Settings & Hooking Webhook...
                          </>
                        ) : (
                          <>
                            <Database className="w-4 h-4" />
                            Save Configuration
                          </>
                        )}
                      </button>

                    </form>
                  </div>

                  {/* App instructions */}
                  <div className="mt-6 border-t border-zinc-800/60 pt-4 text-xs text-zinc-500 space-y-2">
                    <p className="font-semibold text-zinc-400">⚡ How Webhooks work:</p>
                    <p>When you click save, our Express backend securely informs Telegram of our server url so your Telegram messages route here automatically. Ensure your Bot is Active using the master toggle above!</p>
                  </div>
                </div>
              </div>

              {/* TEST SANDBOX / REAL-TIME SIMULATOR (RIGHT - 7 columns) */}
              <div className="lg:col-span-7 flex flex-col">
                <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 p-6 flex-1 flex flex-col justify-between backdrop-blur-sm shadow-xl relative overflow-hidden">
                  
                  {/* Decorative background visual */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-indigo-400" />
                      <div>
                        <h2 className="text-lg font-bold text-white">Bot Simulator Sandbox</h2>
                        <p className="text-xs text-zinc-500">Test rules & AI conversations locally before public deployment</p>
                      </div>
                    </div>
                    <button
                      onClick={handleClearSandbox}
                      className="text-xs text-zinc-400 hover:text-white px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700/60 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      Reset Conversational AI
                    </button>
                  </div>

                  {/* Simulator Message Feed */}
                  <div className="flex-1 min-h-[300px] max-h-[360px] overflow-y-auto bg-zinc-950/80 rounded-xl p-4 border border-zinc-800 space-y-4 mb-4 scrollbar-thin">
                    {sandboxMessages.map((msg, index) => {
                      if (msg.sender === 'system') {
                        return (
                          <div key={index} className="flex justify-center">
                            <div className="bg-zinc-900/80 text-zinc-400 text-xs px-3 py-1.5 rounded-lg border border-zinc-800/50 flex items-center gap-1.5 max-w-[90%] text-center">
                              <Info className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                              <span>{msg.text}</span>
                            </div>
                          </div>
                        );
                      }

                      const isBot = msg.sender === 'bot';
                      return (
                        <div key={index} className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}>
                          <div className={`flex flex-col max-w-[80%] ${isBot ? 'items-start' : 'items-end'}`}>
                            
                            {/* Message Bubble */}
                            <div className={`px-4 py-3 rounded-2xl text-sm ${
                              isBot
                                ? 'bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700/40'
                                : 'bg-indigo-600 text-white rounded-tr-none'
                            }`}>
                              <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
                            </div>

                            {/* Metadata / Match type tags */}
                            <div className="flex items-center gap-2 mt-1">
                              {isBot && msg.matchedDetails && (
                                <span className="text-[10px] bg-zinc-900 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded-md font-mono">
                                  {msg.matchedDetails}
                                </span>
                              )}
                              <span className="text-[9px] text-zinc-500 font-mono">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                    {sendingSandbox && (
                      <div className="flex justify-start">
                        <div className="bg-zinc-800 text-zinc-400 text-xs px-4 py-3 rounded-2xl rounded-tl-none border border-zinc-700/40 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"></span>
                          <span className="font-mono text-[10px] ml-1">Bot is formulating response...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Simulator Input Box */}
                  <form onSubmit={handleSendSandboxMessage} className="flex gap-2">
                    <input
                      type="text"
                      placeholder={config.mode === 'inactive' ? '🚫 Bot is inactive. Enable Keyword or AI Mode to test replies' : 'Type a test customer message (e.g. "hello", "pricing", "custom")...'}
                      value={sandboxInput}
                      onChange={(e) => setSandboxInput(e.target.value)}
                      disabled={sendingSandbox || config.mode === 'inactive'}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/10 text-zinc-100 disabled:opacity-50 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={sendingSandbox || !sandboxInput.trim() || config.mode === 'inactive'}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700/20 disabled:text-zinc-500 text-white p-3 rounded-xl transition-all flex items-center justify-center h-11 w-11 flex-shrink-0 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>

                  <div className="mt-3 text-center">
                    <p className="text-[10px] text-zinc-500 italic">
                      Conversations in sandbox generate live logs and stats entries, keeping your dashboards interactive!
                    </p>
                  </div>

                </div>
              </div>

            </div>

            {/* KEYWORD AUTO-REPLY RULES MANAGER */}
            <section className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 p-6 backdrop-blur-sm shadow-xl">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-lg font-bold text-white">Keyword Auto-Reply Rules</h2>
                  </div>
                  <p className="text-zinc-400 text-xs mt-0.5">Define keyword patterns to catch instantly and dispatch specific pre-defined answers.</p>
                </div>
                {!showRuleForm && (
                  <button
                    onClick={() => setShowRuleForm(true)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Add Auto-Reply Rule
                  </button>
                )}
              </div>

              {/* Collapsible rule form */}
              <AnimatePresence>
                {showRuleForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden bg-zinc-950/50 rounded-xl border border-zinc-800 p-5 mb-6 space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3 mb-1">
                      <h3 className="text-sm font-semibold text-white">
                        {editingRuleId ? '📝 Edit Keyword Reply Rule' : '✨ Define New Keyword Reply Rule'}
                      </h3>
                      <button onClick={resetRuleForm} className="text-xs text-zinc-500 hover:text-zinc-300">
                        Cancel
                      </button>
                    </div>

                    <form onSubmit={handleSaveRule} className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      
                      {/* Pattern trigger */}
                      <div className="md:col-span-5">
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                          Trigger Pattern (Phrase / Word)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. refund, password help, location"
                          value={newRulePattern}
                          onChange={(e) => setNewRulePattern(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/80 text-zinc-100 transition-all font-semibold"
                        />
                      </div>

                      {/* Match type */}
                      <div className="md:col-span-3">
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                          Match Method
                        </label>
                        <select
                          value={newRuleMatchType}
                          onChange={(e) => setNewRuleMatchType(e.target.value as any)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/80 text-zinc-100 transition-all font-mono"
                        >
                          <option value="contains">Contains (Broad)</option>
                          <option value="exact">Exact (Strict)</option>
                          <option value="regex">Regex (Pattern)</option>
                        </select>
                      </div>

                      {/* Blank spacing on grid */}
                      <div className="md:col-span-4 flex items-end">
                        <div className="text-[11px] text-zinc-500 italic pb-2">
                          {newRuleMatchType === 'contains' && 'Matches if message contains the phrase (case-insensitive)'}
                          {newRuleMatchType === 'exact' && 'Matches only if message matches the word exactly'}
                          {newRuleMatchType === 'regex' && 'Matches advanced custom regex patterns (e.g. ^[0-9]+$)'}
                        </div>
                      </div>

                      {/* Reply content */}
                      <div className="md:col-span-12">
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                          Auto-Reply Content (Markdown & Emojis supported)
                        </label>
                        <textarea
                          placeholder="Write your bot response message here..."
                          value={newRuleReply}
                          onChange={(e) => setNewRuleReply(e.target.value)}
                          rows={3}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/80 text-zinc-100 transition-all"
                        />
                      </div>

                      <div className="md:col-span-12 flex justify-end gap-2 pt-2 border-t border-zinc-800/40">
                        <button
                          type="button"
                          onClick={resetRuleForm}
                          className="px-4 py-2 rounded-xl text-xs font-medium border border-zinc-800 hover:bg-zinc-900 text-zinc-300 transition-all cursor-pointer"
                        >
                          Discard
                        </button>
                        <button
                          type="submit"
                          disabled={savingRule}
                          className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer"
                        >
                          {savingRule ? 'Saving Rule...' : editingRuleId ? 'Update Rule' : 'Add Rule'}
                        </button>
                      </div>

                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Rules List table */}
              {rules.length === 0 ? (
                <div className="text-center py-8 bg-zinc-950/30 rounded-xl border border-zinc-800/40">
                  <Sliders className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No keyword auto-reply rules configured yet.</p>
                  <p className="text-zinc-600 text-xs mt-1">Add rule triggers to dispatch instant answers instantly.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-800 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-950/60 border-b border-zinc-800 text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                        <th className="p-4">Trigger Pattern</th>
                        <th className="p-4">Matching Method</th>
                        <th className="p-4 max-w-sm">Auto-Reply Content</th>
                        <th className="p-4 text-center">Hits</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-sm">
                      {rules.map((rule) => (
                        <tr key={rule.id} className="hover:bg-zinc-900/20 transition-all">
                          
                          <td className="p-4 font-mono font-bold text-white max-w-[150px] truncate">
                            {rule.pattern}
                          </td>

                          <td className="p-4">
                            <span className="text-[11px] font-semibold bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full border border-zinc-700/50">
                              {rule.matchType === 'exact' ? 'Exact Match' : rule.matchType === 'regex' ? 'Regex Pattern' : 'Contains (Broad)'}
                            </span>
                          </td>

                          <td className="p-4 text-zinc-300 max-w-sm truncate whitespace-pre-wrap">
                            {rule.replyContent}
                          </td>

                          <td className="p-4 text-center font-mono font-semibold text-indigo-400">
                            {rule.replyCount}
                          </td>

                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleToggleRule(rule.id)}
                              className={`mx-auto px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer select-none border transition-all ${
                                rule.isActive
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                  : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700'
                              }`}
                            >
                              {rule.isActive ? 'Active' : 'Disabled'}
                            </button>
                          </td>

                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEditRule(rule)}
                                className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-all cursor-pointer"
                                title="Edit rule"
                              >
                                <Sliders className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="p-1.5 hover:bg-zinc-800 text-rose-500/80 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                                title="Delete rule"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* TWO-COLUMN GRID: STATISTICS (LEFT) & LIVE SYSTEM LOGS (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* STATISTICS & ANALYTICS CHART (5 columns) */}
              <div className="lg:col-span-5 flex flex-col">
                <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 p-6 flex-1 flex flex-col justify-between backdrop-blur-sm shadow-xl">
                  
                  <div>
                    <div className="flex items-center justify-between border-b border-zinc-800/60 pb-4 mb-5">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-bold text-white">Bot Intelligence Stats</h2>
                      </div>
                      <button
                        onClick={handleResetStats}
                        className="text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 px-2 py-1.5 rounded-md border border-zinc-700/60 transition-all cursor-pointer"
                      >
                        Reset Counters
                      </button>
                    </div>

                    {/* Numeric stats blocks */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      
                      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80">
                        <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Total Received</div>
                        <div className="text-2xl font-bold font-mono text-white mt-1">{stats.totalReceived}</div>
                      </div>

                      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80">
                        <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Auto Replies</div>
                        <div className="text-2xl font-bold font-mono text-indigo-400 mt-1">{stats.totalReplies}</div>
                      </div>

                      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80">
                        <div className="text-xs text-zinc-400 font-medium flex items-center gap-1">
                          <Sliders className="w-3 h-3 text-zinc-400" /> Keywords Matched
                        </div>
                        <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{stats.keywordMatches}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">Instant matching</div>
                      </div>

                      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80">
                        <div className="text-xs text-zinc-400 font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-indigo-400" /> Gemini AI replies
                        </div>
                        <div className="text-xl font-bold font-mono text-indigo-400 mt-1">{stats.aiMatches}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">Cognitive fallback</div>
                      </div>

                    </div>

                    {/* Recharts chart */}
                    <div className="mb-2">
                      <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Message Volume History (7 Days)</div>
                      <div className="h-[150px] w-full bg-zinc-950/60 p-2 rounded-xl border border-zinc-800">
                        {stats.dailyChartData && stats.dailyChartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.dailyChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorReplies" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} />
                              <YAxis tick={{ fill: '#71717a', fontSize: 10 }} allowDecimals={false} />
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                              <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff', fontSize: 12, borderRadius: 8 }} />
                              <Area type="monotone" dataKey="received" stroke="#6366f1" strokeWidth={1.5} fillOpacity={1} fill="url(#colorReceived)" name="Received" />
                              <Area type="monotone" dataKey="replies" stroke="#10b981" strokeWidth={1.5} fillOpacity={1} fill="url(#colorReplies)" name="Replies" />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-zinc-600 text-xs">No chart metrics available.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-zinc-500 mt-4 border-t border-zinc-800/40 pt-3">
                    Metrics aggregate both live webhook activities from Telegram and local simulator sandbox interactions.
                  </div>

                </div>
              </div>

              {/* AUDIT LOGS / SYSTEM RECORDS (7 columns) */}
              <div className="lg:col-span-7 flex flex-col">
                <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 p-6 flex-1 flex flex-col justify-between backdrop-blur-sm shadow-xl">
                  
                  <div>
                    <div className="flex items-center justify-between border-b border-zinc-800/60 pb-4 mb-4 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-bold text-white">Live Execution Logs</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setAutoPoll(!autoPoll)}
                          title={autoPoll ? "Disable auto polling" : "Enable 5s auto polling"}
                          className={`text-[10px] px-2.5 py-1.5 rounded-md border transition-all cursor-pointer flex items-center gap-1.5 ${
                            autoPoll 
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 font-semibold' 
                              : 'text-zinc-400 bg-zinc-850 border-zinc-700/60 hover:text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${autoPoll ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                          {autoPoll ? 'Live Polling: ON' : 'Live Polling: OFF'}
                        </button>
                        <button
                          onClick={handleToggleGroupBySender}
                          title={groupBySender ? "Show chronological logs" : "Group logs by conversation thread sender"}
                          className={`text-[10px] px-2.5 py-1.5 rounded-md border transition-all cursor-pointer flex items-center gap-1.5 ${
                            groupBySender 
                              ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30 font-semibold' 
                              : 'text-zinc-400 bg-zinc-850 border-zinc-700/60 hover:text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          {groupBySender ? 'Grouped Senders' : 'Flat Feed'}
                        </button>
                        <button
                          onClick={handleDownloadJSON}
                          disabled={logs.length === 0}
                          title="Download logs as JSON file"
                          className="text-[10px] text-zinc-300 hover:text-white bg-zinc-800 px-2.5 py-1.5 rounded-md border border-zinc-700/60 transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Download className="w-3 h-3" /> JSON
                        </button>
                        <button
                          onClick={handleDownloadCSV}
                          disabled={logs.length === 0}
                          title="Download logs as CSV file"
                          className="text-[10px] text-zinc-300 hover:text-white bg-zinc-800 px-2.5 py-1.5 rounded-md border border-zinc-700/60 transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Download className="w-3 h-3" /> CSV
                        </button>
                        <button
                          onClick={handleClearLogs}
                          className="text-[10px] text-rose-400 hover:text-rose-300 bg-rose-500/5 px-2.5 py-1.5 rounded-md border border-rose-500/20 transition-all cursor-pointer"
                        >
                          Clear Audit Trail
                        </button>
                      </div>
                    </div>

                    {/* Search Input for filtering logs */}
                    {logs.length > 0 && (
                      <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Search logs by message, sender, username, rule or status..."
                          value={logSearchQuery}
                          onChange={(e) => setLogSearchQuery(e.target.value)}
                          className="w-full bg-zinc-950/80 border border-zinc-800/80 rounded-xl pl-9 pr-8 py-2 text-xs text-zinc-300 placeholder-zinc-550 focus:outline-none focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/30 transition-all font-sans"
                        />
                        {logSearchQuery && (
                          <button
                            onClick={() => setLogSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-350 text-[10px] transition-colors cursor-pointer px-1 font-bold"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}

                    {/* Logs terminal style display */}
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-h-[350px] overflow-y-auto scrollbar-thin">
                      {logs.length === 0 ? (
                        <div className="text-center py-16 text-zinc-600">
                          <FileText className="w-8 h-8 mx-auto text-zinc-700 mb-2" />
                          <p className="text-sm">No transaction log entries found.</p>
                          <p className="text-xs mt-1">Activities logged instantly when a message hits your webhook or simulator.</p>
                        </div>
                      ) : filteredLogs.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500">
                          <Search className="w-8 h-8 mx-auto text-zinc-750 mb-2" />
                          <p className="text-xs font-semibold">No logs found matching your filter.</p>
                          <button
                            onClick={() => setLogSearchQuery('')}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 underline mt-1 cursor-pointer bg-transparent border-none"
                          >
                            Clear search query
                          </button>
                        </div>
                      ) : (
                        <div className="font-mono text-xs divide-y divide-zinc-900">
                          {groupBySender ? (
                            groupedLogsList.map((group) => {
                              const isGroupExpanded = expandedGroupIds.includes(String(group.senderId || group.senderName));
                              return (
                                <div key={String(group.senderId || group.senderName)} className="bg-zinc-950/20">
                                  {/* Group Header Row */}
                                  <div
                                    onClick={() => toggleGroupExpansion(String(group.senderId || group.senderName))}
                                    className="flex items-center justify-between p-3 bg-zinc-950 hover:bg-zinc-900/30 border-b border-zinc-900/40 transition-all cursor-pointer select-none"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                                      <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-white font-bold text-xs">{group.senderName}</span>
                                          {group.senderUsername && (
                                            <span className="text-indigo-400 text-[10px]">@{group.senderUsername}</span>
                                          )}
                                        </div>
                                        <span className="text-[9px] text-zinc-500 mt-0.5">
                                          Last active: {new Date(group.latestTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-semibold">
                                        {group.logs.length} {group.logs.length === 1 ? 'msg' : 'msgs'}
                                      </span>
                                      {isGroupExpanded ? (
                                        <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
                                      ) : (
                                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                                      )}
                                    </div>
                                  </div>

                                  {/* Group Log List */}
                                  {isGroupExpanded && (
                                    <div className="bg-zinc-950/50 pl-4 border-l-2 border-indigo-500/20 divide-y divide-zinc-900/60">
                                      {group.logs.map((log) => {
                                        const isExpanded = expandedLogIds.includes(log.id);
                                        return (
                                          <div
                                            key={log.id}
                                            onClick={() => toggleLogExpansion(log.id)}
                                            className="p-3 hover:bg-zinc-900/30 transition-all text-zinc-300 cursor-pointer select-none"
                                          >
                                            <div className="space-y-1">
                                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-zinc-650">
                                                    {isExpanded ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}
                                                  </span>
                                                  <span className="text-zinc-500 text-[10px]">
                                                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                  <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold ${
                                                    log.matchedRuleType === 'keyword' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' :
                                                    log.matchedRuleType === 'ai' ? 'bg-indigo-950/80 text-indigo-400 border border-indigo-900/50' :
                                                    'bg-zinc-800 text-zinc-500'
                                                  }`}>
                                                    {log.matchedRuleType === 'keyword' ? 'keyword' : log.matchedRuleType === 'ai' ? 'gemini ai' : 'none'}
                                                  </span>
                                                  {log.success ? (
                                                    <span className="text-emerald-400 font-bold" title="Message delivered successfully">✔</span>
                                                  ) : (
                                                    <span className="text-rose-500 font-bold" title={log.error || 'Ignored/Failed'}>✘</span>
                                                  )}
                                                </div>
                                              </div>

                                              <div className="pl-4 border-l border-zinc-850 mt-1">
                                                <div className="text-zinc-500 italic">Incoming: &quot;{log.incomingMessage}&quot;</div>
                                                {log.replySent && (
                                                  <div className="text-zinc-300 mt-0.5">
                                                    <span className="text-indigo-500 mr-1">↳</span>Reply: {log.replySent}
                                                  </div>
                                                )}
                                                {log.error && (
                                                  <div className="text-rose-400/90 text-[10px] mt-0.5 flex items-center gap-1 font-sans">
                                                    <AlertCircle className="w-3 h-3 flex-shrink-0 text-rose-500" />
                                                    <span>Error: {log.error}</span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>

                                            {isExpanded && (
                                              <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="mt-3 pl-4 pr-3 py-2.5 bg-zinc-950 border border-zinc-800/80 rounded-lg text-[10px] font-mono text-zinc-400 space-y-2 overflow-x-auto cursor-text select-text"
                                              >
                                                <div className="flex items-center justify-between border-b border-zinc-900 pb-1 mb-1.5 flex-wrap gap-2">
                                                  <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold flex items-center gap-1">
                                                    <Terminal className="w-3 h-3" /> Raw Transaction Payload
                                                  </span>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-[9px] text-zinc-650">ID: {log.id}</span>
                                                    <button
                                                      onClick={(e) => copyLogToClipboard(e, log.id, log)}
                                                      className={`text-[10px] px-2 py-1 rounded border transition-all cursor-pointer flex items-center gap-1 font-sans ${
                                                        copiedLogId === log.id
                                                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                                                          : 'text-zinc-400 bg-zinc-900 border-zinc-800 hover:text-zinc-300 hover:bg-zinc-850'
                                                      }`}
                                                    >
                                                      {copiedLogId === log.id ? (
                                                        <>
                                                          <Check className="w-3 h-3 text-emerald-400" /> Copied!
                                                        </>
                                                      ) : (
                                                        <>
                                                          <Copy className="w-3 h-3" /> Copy Payload
                                                        </>
                                                      )}
                                                    </button>
                                                  </div>
                                                </div>
                                                <pre className="text-zinc-300 overflow-x-auto select-all max-h-[220px] overflow-y-auto scrollbar-thin whitespace-pre-wrap">
                                                  {JSON.stringify(log, null, 2)}
                                                </pre>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            filteredLogs.map((log) => {
                              const isExpanded = expandedLogIds.includes(log.id);
                              return (
                                <div
                                  key={log.id}
                                  onClick={() => toggleLogExpansion(log.id)}
                                  className="p-3 hover:bg-zinc-900/40 transition-all text-zinc-300 cursor-pointer select-none"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="flex items-center gap-2">
                                        <span className="text-zinc-600">
                                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 inline" /> : <ChevronDown className="w-3.5 h-3.5 inline" />}
                                        </span>
                                        <span className="text-zinc-500">
                                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                        <span className="text-white font-semibold">{log.senderName}</span>
                                        {log.senderUsername && (
                                          <span className="text-indigo-400 text-[10px]">@{log.senderUsername}</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                                          log.matchedRuleType === 'keyword' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' :
                                          log.matchedRuleType === 'ai' ? 'bg-indigo-950/80 text-indigo-400 border border-indigo-900/50' :
                                          'bg-zinc-800 text-zinc-500'
                                        }`}>
                                          {log.matchedRuleType === 'keyword' ? 'keyword' : log.matchedRuleType === 'ai' ? 'gemini ai' : 'none'}
                                        </span>
                                        {log.success ? (
                                          <span className="text-emerald-400 font-bold" title="Message delivered successfully">✔</span>
                                        ) : (
                                          <span className="text-rose-500 font-bold" title={log.error || 'Ignored/Failed'}>✘</span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="pl-5 border-l border-zinc-800 mt-1">
                                      <div className="text-zinc-500 italic">Incoming: &quot;{log.incomingMessage}&quot;</div>
                                      {log.replySent && (
                                        <div className="text-zinc-300 mt-0.5">
                                          <span className="text-indigo-500 mr-1">↳</span>Reply: {log.replySent}
                                        </div>
                                      )}
                                      {log.error && (
                                        <div className="text-rose-400/90 text-[10px] mt-0.5 flex items-center gap-1 font-sans">
                                          <AlertCircle className="w-3 h-3 flex-shrink-0 text-rose-500" />
                                          <span>Error: {log.error}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {isExpanded && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="mt-3 pl-4 pr-3 py-2.5 bg-zinc-950 border border-zinc-800/80 rounded-lg text-[10px] font-mono text-zinc-400 space-y-2 overflow-x-auto cursor-text select-text"
                                    >
                                      <div className="flex items-center justify-between border-b border-zinc-900 pb-1 mb-1.5 flex-wrap gap-2">
                                        <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold flex items-center gap-1">
                                          <Terminal className="w-3 h-3" /> Raw Transaction Payload
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] text-zinc-650">ID: {log.id}</span>
                                          <button
                                            onClick={(e) => copyLogToClipboard(e, log.id, log)}
                                            className={`text-[10px] px-2 py-1 rounded border transition-all cursor-pointer flex items-center gap-1 font-sans ${
                                              copiedLogId === log.id
                                                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                                                : 'text-zinc-400 bg-zinc-900 border-zinc-800 hover:text-zinc-300 hover:bg-zinc-850'
                                            }`}
                                          >
                                            {copiedLogId === log.id ? (
                                              <>
                                                <Check className="w-3 h-3 text-emerald-400" /> Copied!
                                              </>
                                            ) : (
                                              <>
                                                <Copy className="w-3 h-3" /> Copy Payload
                                              </>
                                            )}
                                          </button>
                                        </div>
                                      </div>
                                      <pre className="text-zinc-300 overflow-x-auto select-all max-h-[220px] overflow-y-auto scrollbar-thin whitespace-pre-wrap">
                                        {JSON.stringify(log, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-[10px] text-zinc-500 mt-4 border-t border-zinc-800/40 pt-3 flex justify-between items-center">
                    <span>Logs store the most recent 100 historical queries to protect database memory.</span>
                    <button
                      onClick={fetchDashboardData}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 cursor-pointer font-sans text-[11px]"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Force Sync
                    </button>
                  </div>

                </div>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
