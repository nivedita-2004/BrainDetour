import { createContext } from 'react'
import { THEME_MODES } from '../lib/constants'

export const ThemeContext = createContext({
  theme: THEME_MODES.LIGHT,
  setTheme: () => {},
  toggleTheme: () => {},
})
