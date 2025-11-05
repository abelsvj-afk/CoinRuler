'use client';

import { motion } from 'framer-motion';
import { cn, colors, shadows, borderRadius } from '@/lib/design-system';
import { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  className?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-r from-[#FFB800] to-[#FFC82C]
    text-[#0A1628] font-semibold
    shadow-[0_0_20px_rgba(255,184,0,0.3)]
    hover:shadow-[0_0_30px_rgba(255,184,0,0.5)]
    hover:scale-105
    active:scale-95
  `,
  secondary: `
    bg-white/10 backdrop-blur-md
    border border-white/20
    text-white
    hover:bg-white/15 hover:border-[#FFB800]/30
    hover:shadow-[0_8px_32px_rgba(0,0,0,0.37)]
  `,
  ghost: `
    bg-transparent
    text-white/80
    hover:bg-white/5 hover:text-white
  `,
  danger: `
    bg-gradient-to-r from-[#EF4444] to-[#DC2626]
    text-white font-semibold
    shadow-[0_0_20px_rgba(239,68,68,0.3)]
    hover:shadow-[0_0_30px_rgba(239,68,68,0.5)]
    hover:scale-105
    active:scale-95
  `,
  success: `
    bg-gradient-to-r from-[#10B981] to-[#059669]
    text-white font-semibold
    shadow-[0_0_20px_rgba(16,185,129,0.3)]
    hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]
    hover:scale-105
    active:scale-95
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-base rounded-xl',
  lg: 'px-7 py-3.5 text-lg rounded-2xl',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  fullWidth = false,
  icon,
  className,
}: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative overflow-hidden',
        'font-medium',
        'transition-all duration-300 ease-out',
        'focus:outline-none focus:ring-2 focus:ring-[#FFB800] focus:ring-offset-2 focus:ring-offset-[#0A1628]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
        fullWidth && 'w-full',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {/* Shimmer effect overlay */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        animate={{
          x: ['-100%', '200%'],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatDelay: 1,
          ease: 'linear',
        }}
      />
      
      {/* Button content */}
      <span className="relative flex items-center justify-center gap-2">
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </span>
    </motion.button>
  );
}
