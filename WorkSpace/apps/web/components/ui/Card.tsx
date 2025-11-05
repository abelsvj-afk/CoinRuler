'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/design-system';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  gradient?: boolean;
}

export function Card({ children, className, hover = false, glow = false, gradient = false }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={hover ? { scale: 1.02, y: -4 } : {}}
      className={cn(
        'relative overflow-hidden',
        'rounded-2xl',
        // Glassmorphism effect
        'bg-white/5 backdrop-blur-md',
        'border border-white/10',
        'shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]',
        // Hover effects
        hover && 'transition-all duration-300 cursor-pointer',
        hover && 'hover:bg-white/8 hover:border-[#FFB800]/30',
        hover && 'hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.5)]',
        // Glow effect
        glow && 'hover:shadow-[0_0_20px_rgba(255,184,0,0.3)]',
        className
      )}
    >
      {/* Gradient overlay for premium cards */}
      {gradient && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#FFB800]/10 via-transparent to-transparent pointer-events-none" />
      )}
      
      {/* Border glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FFB800]/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

export function StatCard({ label, value, change, icon, trend = 'neutral' }: StatCardProps) {
  const trendColors = {
    up: 'text-[#10B981]',
    down: 'text-[#EF4444]',
    neutral: 'text-white/60',
  };

  return (
    <Card hover glow gradient>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <span className="text-sm font-medium text-white/60 uppercase tracking-wider">
            {label}
          </span>
          {icon && (
            <div className="p-2 rounded-lg bg-[#FFB800]/10">
              {icon}
            </div>
          )}
        </div>
        
        <div className="flex items-end justify-between">
          <span className="text-3xl font-bold text-white">
            {value}
          </span>
          
          {change !== undefined && (
            <div className={cn('flex items-center gap-1 text-sm font-semibold', trendColors[trend])}>
              {trend === 'up' && '↑'}
              {trend === 'down' && '↓'}
              {Math.abs(change).toFixed(2)}%
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
