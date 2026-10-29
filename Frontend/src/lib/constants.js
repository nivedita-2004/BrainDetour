/**
 * Application-wide constants for the Curiosity, Learning, and AI Evidence Review Platform.
 * Centralizing these values avoids hardcoded magic numbers and ensures consistent configurations.
 */

export const APP_CONFIG = {
  name: 'BrainDetour',
  tagline: 'Step away from the noise. Step closer to knowledge.',
  version: '1.1.0',
}

/**
 * Primary navigation routes and labels
 */
export const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Blog', path: '/blog' },
  { label: 'Speech Lab', path: '/presentation' },
]

/**
 * Footer navigation links
 */
export const FOOTER_LINKS = [
  { label: 'FAQ', path: '/faq' },
  { label: 'Contact', path: '/contact' },
  { label: 'Privacy Policy', path: '/privacy' },
  { label: 'Terms of Service', path: '/terms' },
]

export const SUPPORT_EMAIL = 'braindetour2026@gmail.com'

/**
 * Authentication routes
 */
export const AUTH_LINKS = {
  login: { label: 'Log In', path: '/login' },
  signup: { label: 'Sign Up', path: '/signup' },
}

/**
 * Centralized Design Palette Tokens
 */
export const DESIGN_PALETTE = {
  pageBg: '#EDE3F8',
  secondaryLavender: '#D8C4EF',
  primaryPurple: '#9270C8',
  deepPurple: '#7253A8',
  creamSurface: '#FFF8F0',
  white: '#FFFFFF',
  mainText: '#49365F',
  secondaryText: '#746B80',
  pinkAccent: '#F2B8C8',
  mintAccent: '#A9D4C4',
}

/**
 * Canonical 10 Topic Categories for BrainDetour Serendipitous Discovery
 * Shared canonical list used by the interactive wheel, catalog filters, and inquiry modules.
 */
export const WHEEL_CATEGORIES = [
  'Psychology',
  'History',
  'Science',
  'Technology',
  'Philosophy',
  'Art',
  'Sociology',
  'Nature',
  'Curious',
  'Literature',
]

/**
 * Ten Coordinated Wheel Segments with Distinct Soft Pastel Colors and Icons
 */
export const WHEEL_SEGMENTS = [
  {
    id: 'psychology',
    label: 'Psychology',
    category: 'Psychology',
    color: '#E8D8F8', // Soft Lilac
    textColor: '#49365F',
    icon: '🧠',
  },
  {
    id: 'history',
    label: 'History',
    category: 'History',
    color: '#FFE5D9', // Soft Warm Peach
    textColor: '#49365F',
    icon: '📜',
  },
  {
    id: 'science',
    label: 'Science',
    category: 'Science',
    color: '#D5EFE3', // Soft Mint Sage
    textColor: '#49365F',
    icon: '🔬',
  },
  {
    id: 'technology',
    label: 'Technology',
    category: 'Technology',
    color: '#E0E7FF', // Soft Periwinkle
    textColor: '#49365F',
    icon: '⚡',
  },
  {
    id: 'philosophy',
    label: 'Philosophy',
    category: 'Philosophy',
    color: '#FEF3C7', // Soft Warm Amber
    textColor: '#49365F',
    icon: '⚖️',
  },
  {
    id: 'art',
    label: 'Art',
    category: 'Art',
    color: '#FCE2EB', // Soft Pastel Rose
    textColor: '#49365F',
    icon: '🎨',
  },
  {
    id: 'sociology',
    label: 'Sociology',
    category: 'Sociology',
    color: '#EDE4F7', // Soft Orchid
    textColor: '#49365F',
    icon: '👥',
  },
  {
    id: 'nature',
    label: 'Nature',
    category: 'Nature',
    color: '#D1FAE5', // Soft Emerald Mint
    textColor: '#49365F',
    icon: '🌿',
  },
  {
    id: 'curious',
    label: 'Curious',
    category: 'Curious',
    color: '#FEE2E2', // Soft Coral Blush
    textColor: '#49365F',
    icon: '✨',
  },
  {
    id: 'literature',
    label: 'Literature',
    category: 'Literature',
    color: '#E8EEF5', // Soft Serene Slate
    textColor: '#49365F',
    icon: '📖',
  },
]

/**
 * Full List of Topic Categories for Discovery Catalog
 */
export const TOPIC_CATEGORIES = [
  'All',
  ...WHEEL_CATEGORIES,
]

/**
 * Difficulty levels for curiosity tracks
 */
export const DIFFICULTY_LEVELS = {
  FOUNDATIONAL: 'Foundational',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  DEEP_DIVE: 'Deep Dive',
}

/**
 * Presentation practice timer duration options (in minutes)
 */
export const TIMER_DURATION_OPTIONS = [
  { value: 5, label: '5 Minutes' },
  { value: 10, label: '10 Minutes' },
  { value: 15, label: '15 Minutes' },
]

/**
 * Theme tokens and color mode constants
 */
export const THEME_MODES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
}
