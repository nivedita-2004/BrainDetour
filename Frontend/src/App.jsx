import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { ThemeProvider } from './context/ThemeProvider'
import { AuthProvider } from './context/AuthProvider'

/**
 * Top-level application composition component.
 * Mounts global context providers (Theme, Auth) and supplies the central application router.
 */
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
