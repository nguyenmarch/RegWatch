import { useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import AppSidebar from './components/AppSidebar'
import ScrollToTop from './components/ScrollToTop'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Chat from './pages/Chat'
import Documents from './pages/Documents'
import TestHealth from './pages/TestHealth'
import NotFound from './pages/NotFound'
import Remediation from './pages/remediation_doc';

function AppShell() {
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sb-collapsed') === 'true'
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  function toggleCollapse() {
    setCollapsed(v => {
      const next = !v
      localStorage.setItem('sb-collapsed', String(next))
      return next
    })
  }

  // Login page: full-screen, no sidebar
  if (pathname === '/login') {
    return <Login />
  }

  return (
    <div className={`app-shell ${collapsed ? 'app-shell--sm' : ''}`}>
      <AppSidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onMobileOpen={() => setMobileOpen(true)}
      />
      <div className="app-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
          <Route path="/test" element={<TestHealth />} />
          <Route path="*" element={<NotFound />} />
          <Route path="/remediation" element={
            <ProtectedRoute><Remediation /></ProtectedRoute>
          } />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<AppShell />} />
      </Routes>
    </>
  )
}
