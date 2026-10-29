import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import './AppLayout.css'

/**
 * Main application layout wrapper containing shared navigation, main outlet, and footer.
 */
export function AppLayout() {
  return (
    <div className="app-layout">
      <Navbar />
      <main className="app-layout__content">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
