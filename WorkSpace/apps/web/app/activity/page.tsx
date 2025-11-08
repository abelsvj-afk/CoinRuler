"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, AlertTriangle, TrendingUp, Shield, Clock, CheckCircle, XCircle } from "lucide-react";
import { getApiBase } from "../lib/api";
import { useSSE, type SSEEvent } from "../lib/useSSE";
import { BackBar } from "../components/BackBar";

type ActivityEvent = {
  id: string;
  type: 'execution' | 'approval' | 'alert' | 'trade' | 'collateral' | 'profit_taking';
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical';
  timestamp: Date;
  data?: any;
};

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const apiBase = getApiBase();

  // Load historical data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [execRes, appRes] = await Promise.all([
          fetch(`${apiBase}/executions/recent?limit=50`).catch(() => null),
          fetch(`${apiBase}/approvals`).catch(() => null),
        ]);

        if (execRes?.ok) {
          const execData = await execRes.json();
          setExecutions(execData.items || []);
          
          // Convert executions to events
          const execEvents: ActivityEvent[] = (execData.items || []).map((e: any) => ({
            id: `exec-${e._id}`,
            type: 'execution',
            title: `${e.side?.toUpperCase()} ${e.symbol}`,
            message: `${e.side} ${e.amount} ${e.symbol} (Order: ${e.orderId || 'pending'})`,
            timestamp: new Date(e.executedAt),
            severity: e.status === 'filled' ? 'info' : 'warning',
            data: e,
          }));
          setEvents(prev => [...prev, ...execEvents]);
        }

        if (appRes?.ok) {
          const appData = await appRes.json();
          setApprovals(appData || []);
          
          // Convert approvals to events
          const appEvents: ActivityEvent[] = (appData || []).map((a: any) => ({
            id: `app-${a._id}`,
            type: 'approval',
            title: a.title || 'Pending Approval',
            message: a.summary || a.reason || 'Awaiting review',
            timestamp: new Date(a.createdAt),
            severity: 'info',
            data: a,
          }));
          setEvents(prev => [...prev, ...appEvents]);
        }
      } catch (err) {
        console.error('[Activity] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [apiBase]);

  // Handle live SSE updates
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    console.log('[Activity] SSE event:', event);

    let newEvent: ActivityEvent | null = null;

    switch (event.type) {
      case 'approval:created':
        newEvent = {
          id: `app-${Date.now()}`,
          type: 'approval',
          title: event.data?.title || 'New Approval',
          message: event.data?.summary || 'Pending review',
          timestamp: new Date(),
          severity: 'info',
          data: event.data,
        };
        break;

      case 'portfolio:updated':
        // Portfolio updates are frequent; convert to activity event if significant
        if (event.data?.reason && event.data.reason !== 'auto') {
          newEvent = {
            id: `portfolio-${Date.now()}`,
            type: 'execution',
            title: 'Portfolio Updated',
            message: `Reason: ${event.data.reason}`,
            timestamp: new Date(),
            severity: 'info',
            data: event.data,
          };
        }
        break;

      case 'alert':
        newEvent = {
          id: `alert-${Date.now()}`,
          type: event.data?.type === 'collateral_blocked' ? 'collateral' : 'alert',
          title: event.data?.message || 'System Alert',
          message: event.data?.data ? JSON.stringify(event.data.data).slice(0, 100) : '',
          timestamp: new Date(),
          severity: event.data?.severity || 'info',
          data: event.data,
        };
        break;
    }

    if (newEvent) {
      setEvents(prev => [newEvent!, ...prev].slice(0, 200)); // Keep last 200 events
    }
  }, []);

  useSSE(`${apiBase}/live`, handleSSEEvent);

  // Filter events
  const filteredEvents = events
    .filter(e => filter === 'all' || e.type === filter)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const getIcon = (type: string) => {
    switch (type) {
      case 'execution':
      case 'trade':
        return <TrendingUp className="w-5 h-5" />;
      case 'approval':
        return <CheckCircle className="w-5 h-5" />;
      case 'alert':
        return <AlertTriangle className="w-5 h-5" />;
      case 'collateral':
        return <Shield className="w-5 h-5" />;
      case 'profit_taking':
        return <TrendingUp className="w-5 h-5" />;
      default:
        return <Activity className="w-5 h-5" />;
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return 'border-red-500 bg-red-500/10';
      case 'warning':
        return 'border-yellow-500 bg-yellow-500/10';
      case 'info':
      default:
        return 'border-[#FFB800] bg-[#FFB800]/10';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <BackBar title="Activity Feed" />
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <BackBar title="Activity Feed" />

      {/* Filter Bar */}
      <div className="glass rounded-xl p-4 mb-6 flex flex-wrap gap-2">
        {['all', 'execution', 'trade', 'approval', 'alert', 'collateral', 'profit_taking'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-[#FFB800] text-black'
                : 'glass hover:bg-white/10'
            }`}
          >
            {f === 'all' ? 'All Events' : f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            {f === 'all' && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-black/30 text-xs">
                {events.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-[#FFB800]" />
            <span className="text-sm text-white/60">Executions</span>
          </div>
          <div className="text-2xl font-bold">{executions.length}</div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-[#FFB800]" />
            <span className="text-sm text-white/60">Approvals</span>
          </div>
          <div className="text-2xl font-bold">{approvals.length}</div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-[#FFB800]" />
            <span className="text-sm text-white/60">Alerts</span>
          </div>
          <div className="text-2xl font-bold">
            {events.filter(e => e.type === 'alert').length}
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[#FFB800]" />
            <span className="text-sm text-white/60">Total Events</span>
          </div>
          <div className="text-2xl font-bold">{events.length}</div>
        </div>
      </div>

      {/* Event Feed */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredEvents.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`glass-strong rounded-xl p-4 border-l-4 ${getSeverityColor(event.severity)}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg ${getSeverityColor(event.severity)} flex items-center justify-center flex-shrink-0`}>
                  {getIcon(event.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-lg">{event.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <Clock className="w-3 h-3" />
                      {event.timestamp.toLocaleTimeString()}
                    </div>
                  </div>

                  <p className="text-sm text-white/70 mb-2">{event.message}</p>

                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      event.type === 'execution' || event.type === 'trade'
                        ? 'bg-green-500/20 text-green-300'
                        : event.type === 'approval'
                        ? 'bg-blue-500/20 text-blue-300'
                        : event.type === 'alert'
                        ? 'bg-yellow-500/20 text-yellow-300'
                        : 'bg-purple-500/20 text-purple-300'
                    }`}>
                      {event.type.replace('_', ' ')}
                    </span>

                    {event.data?.dryRun && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-[#FFB800]/20 text-[#FFB800]">
                        DRY RUN
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredEvents.length === 0 && (
          <div className="glass rounded-xl p-12 text-center">
            <Activity className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/40">No activity events yet</p>
            <p className="text-xs text-white/30 mt-2">
              Events will appear here as trades execute, approvals are created, and alerts trigger
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
