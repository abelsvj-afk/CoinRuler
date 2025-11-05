// Luxury Design System - Colors, Typography, Shadows, Animations
// Import this in your components for consistent styling

export const colors = {
  // Primary Palette - Deep Navy & Gold
  primary: {
    navy: {
      50: '#E6EBF5',
      100: '#C2D1E8',
      200: '#9AB5DA',
      300: '#7299CC',
      400: '#5483C2',
      500: '#366DB8',
      600: '#2E5FA3',
      700: '#244D8A',
      800: '#1A3B71',
      900: '#0A1628', // Main dark background
    },
    gold: {
      50: '#FFF9E6',
      100: '#FFEFBF',
      200: '#FFE595',
      300: '#FFDB6B',
      400: '#FFD24C',
      500: '#FFC82C',
      600: '#FFB800', // Main gold accent
      700: '#E6A700',
      800: '#CC9600',
      900: '#B38500',
    },
  },

  // Semantic Colors
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Grayscale with transparency
  glass: {
    light: 'rgba(255, 255, 255, 0.05)',
    medium: 'rgba(255, 255, 255, 0.10)',
    heavy: 'rgba(255, 255, 255, 0.15)',
  },
};

export const typography = {
  fontFamily: {
    sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: '"Satoshi", "Inter", sans-serif',
    mono: '"JetBrains Mono", "Fira Code", monospace',
  },
  
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
    '5xl': '3rem',     // 48px
    '6xl': '3.75rem',  // 60px
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  },
};

export const shadows = {
  // Glassmorphism shadows
  glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
  glassHover: '0 12px 40px 0 rgba(0, 0, 0, 0.5)',
  
  // Elevation shadows
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',

  // Glow effects
  goldGlow: '0 0 20px rgba(255, 184, 0, 0.3)',
  goldGlowHover: '0 0 30px rgba(255, 184, 0, 0.5)',
  
  // Inner shadows for depth
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
};

export const gradients = {
  // Premium gradients
  goldShimmer: 'linear-gradient(135deg, #FFB800 0%, #FFC82C 50%, #FFD24C 100%)',
  navyGradient: 'linear-gradient(180deg, #0A1628 0%, #1A3B71 100%)',
  glassGradient: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
  
  // Overlay gradients
  darkOverlay: 'linear-gradient(180deg, rgba(10, 22, 40, 0.8) 0%, rgba(10, 22, 40, 0.95) 100%)',
  shimmerOverlay: 'linear-gradient(90deg, transparent, rgba(255, 184, 0, 0.1), transparent)',
  
  // Status gradients
  bullish: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
  bearish: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
};

export const animations = {
  // Timing functions
  easing: {
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    elastic: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
  },

  // Duration presets
  duration: {
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
    slower: '700ms',
  },

  // Framer Motion variants
  fadeIn: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },

  slideIn: {
    initial: { opacity: 0, x: -50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 50 },
  },

  scaleIn: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
  },

  shimmer: {
    animate: {
      backgroundPosition: ['0% 0%', '100% 0%'],
    },
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

export const glassmorphism = {
  // Ready-to-use glassmorphism styles
  card: {
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: shadows.glass,
  },

  cardHover: {
    background: 'rgba(255, 255, 255, 0.08)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 184, 0, 0.3)',
    boxShadow: shadows.glassHover,
  },

  panel: {
    background: 'rgba(10, 22, 40, 0.6)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
};

export const spacing = {
  xs: '0.5rem',   // 8px
  sm: '0.75rem',  // 12px
  md: '1rem',     // 16px
  lg: '1.5rem',   // 24px
  xl: '2rem',     // 32px
  '2xl': '3rem',  // 48px
  '3xl': '4rem',  // 64px
  '4xl': '6rem',  // 96px
};

export const borderRadius = {
  sm: '0.375rem',  // 6px
  md: '0.5rem',    // 8px
  lg: '0.75rem',   // 12px
  xl: '1rem',      // 16px
  '2xl': '1.5rem', // 24px
  full: '9999px',
};

// Utility function for conditional classes
export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}
