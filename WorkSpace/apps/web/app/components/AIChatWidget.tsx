"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * AI Chat Widget (Requirement 13)
 * Natural language commands + portfolio Q&A
 */

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{
    id: '0',
    role: 'assistant',
    content: 'Hi! I can help you with portfolio questions and execute commands. Try: "show latest Monte Carlo", "what\'s my XRP balance?", or "toggle DRY_RUN"',
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleCommand = async (userInput: string) => {
    const lower = userInput.toLowerCase();
    
    // Natural language commands
    try {
      // Show Monte Carlo
      if (lower.includes('monte carlo') || lower.includes('simulation')) {
        const response = await fetch('/api/ruler/analysis/projection');
        const data = await response.json();
        return `📊 Monte Carlo Results:\n\nMean: $${data.monteCarlo.mean.toFixed(2)}\nMedian: $${data.monteCarlo.median.toFixed(2)}\nP5: $${data.monteCarlo.percentile_5.toFixed(2)}\nP95: $${data.monteCarlo.percentile_95.toFixed(2)}\n\nConfidence: ${(data.confidence * 100).toFixed(0)}%\nSamples: ${data.summary.samples}`;
      }
      
            return `BTC Holdings:\n\nTotal: ${(data.collateral?.btcTotal ?? data.balances.BTC ?? 0).toFixed(8)} BTC\nFree: ${(data.btcFree ?? data.collateral?.btcFree ?? 0).toFixed(8)} BTC\nLocked: ${(data.collateral?.btcLocked ?? 0).toFixed(8)} BTC\nPrice: $${(data.prices.BTC ?? 0).toFixed(2)}\nValue: $${(((data.collateral?.btcTotal ?? data.balances.BTC) || 0) * (data.prices.BTC || 0)).toFixed(2)}\nNote: Locked BTC is collateral and will not be sold until the loan is repaid.`;
      if (lower.includes('balance') || lower.includes('holdings') || lower.includes('portfolio')) {
        const response = await fetch('/api/ruler/portfolio/current');
        const data = await response.json();
        
        if (lower.includes('xrp')) {
          return `XRP Holdings:\n\nTotal: ${data.balances.XRP?.toFixed(2) || 0} XRP\nBaseline: ${data.baselines.XRP?.baseline || 0} XRP\nAbove baseline: ${data.xrpAboveBaseline?.toFixed(2) || 0} XRP\nPrice: $${data.prices.XRP?.toFixed(4) || 0}\nValue: $${((data.balances.XRP || 0) * (data.prices.XRP || 0)).toFixed(2)}`;
        }
        
        if (lower.includes('btc')) {
          return `BTC Holdings:\n\nTotal: ${data.balances.BTC?.toFixed(8) || 0} BTC\nFree: ${data.btcFree?.toFixed(8) || 0} BTC\nLocked: ${data.collateral?.btcLocked?.toFixed(8) || 0} BTC\nPrice: $${data.prices.BTC?.toFixed(2) || 0}\nValue: $${((data.balances.BTC || 0) * (data.prices.BTC || 0)).toFixed(2)}`;
        }
        
        return `Portfolio Value: $${data.totalValueUSD?.toFixed(2) || 0}\n\nTop Holdings:\n${Object.entries(data.balances).slice(0, 5).map(([coin, amt]: [string, any]) => `${coin}: ${amt.toFixed(4)} ($${((amt || 0) * (data.prices[coin] || 0)).toFixed(2)})`).join('\n')}`;
      }
      
      // DRY_RUN toggle
      if (lower.includes('dry run') || lower.includes('dry_run') || lower.includes('dryrun')) {
        const response = await fetch('/api/ruler/health');
        const data = await response.json();
        return `DRY_RUN Status: ${data.dryRun ? '✅ ENABLED (Safe Mode)' : '⚠️ DISABLED (Live Trading)'}\n\nNote: Toggling requires environment variable change and restart.`;
      }
      
      // Approvals
      if (lower.includes('approval') || lower.includes('pending')) {
        const response = await fetch('/api/ruler/approvals/pending');
        const data = await response.json();
        return `Pending Approvals: ${data.count}\n\n${data.items.slice(0, 3).map((a: any) => `• ${a.title || a.type}: ${a.summary || a.reason}`).join('\n')}`;
      }
      
      // Profit opportunities
      if (lower.includes('profit') || lower.includes('take profit') || lower.includes('sell')) {
        const response = await fetch('/api/ruler/analysis/profit-taking');
        const data = await response.json();
        
        if (data.count === 0) {
          return '✅ No profit-taking opportunities right now. All assets below threshold or recently traded.';
        }
        
        const top = data.opportunities[0];
        return `💰 Profit Opportunity Found!\n\nAsset: ${top.asset}\nGain: ${top.gainPct.toFixed(1)}%\nRecommend selling: ${top.recommendedSellQty.toFixed(4)} ${top.asset}\nEstimated profit: $${top.estimatedNetUSD.toFixed(2)} (after fees)\n\nWould you like me to create an approval?`;
      }
      
      // Help
      if (lower.includes('help') || lower === '?') {
        return `Available Commands:\n\n📊 "show Monte Carlo" - View simulations\n💰 "what's my XRP balance?" - Check holdings\n✅ "show approvals" - Pending trades\n💵 "any profit opportunities?" - Scan for sells\n🔒 "DRY_RUN status" - Check safety mode\n📈 "portfolio value" - Total value\n\nAsk me anything about your portfolio!`;
      }
      
      return `I understand you're asking about "${userInput}". Let me check...\n\n(Note: This is a simplified response. Full OpenAI integration coming soon for natural language understanding.)`;
      
    } catch (err: any) {
      return `Error: ${err.message}. Try asking something else!`;
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    
    try {
      // Store in MongoDB
      await fetch('/api/ruler/chat/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      }).catch(() => {}); // Non-blocking
      
      // Process command
      const response = await handleCommand(input);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // Store assistant response
      await fetch('/api/ruler/chat/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: assistantMessage }),
      }).catch(() => {});
      
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `Error: ${err.message}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-8 right-8 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-[#FFB800] to-[#FF8C00] shadow-2xl flex items-center justify-center hover:scale-110 transition-transform group"
          >
            <MessageCircle className="w-6 h-6 text-black group-hover:scale-110 transition-transform" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.8 }}
            className="fixed bottom-8 right-8 z-50 w-96 h-[600px] glass-strong rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/20"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-[#FFB800]/10 to-[#FF8C00]/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FFB800] flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-black" />
                </div>
                <div>
                  <h3 className="font-bold">AI Assistant</h3>
                  <p className="text-xs text-white/60">Portfolio & Commands</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-[#FFB800] text-black'
                        : msg.role === 'system'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-black/70 text-white border border-white/10'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {msg.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="glass rounded-2xl px-4 py-2 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Ask anything..."
                  className="flex-1 bg-black/30 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFB800]/50 border border-white/10"
                  disabled={loading}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                  className="w-10 h-10 rounded-xl bg-[#FFB800] hover:bg-[#FF8C00] transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5 text-black" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
