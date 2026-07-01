import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import RealDashboard from './pages/RealDashboard';
import RealTrading from './pages/RealTrading';
import VirtualDashboard from './pages/VirtualDashboard';
import VirtualTrading from './pages/VirtualTrading';
import Analytics from './pages/Analytics';
import Login from './pages/Login';
import './App.css';

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function Navbar() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const handleLogout = () => {
    localStorage.removeItem('token');
    toast.success('Logged out!');
    navigate('/login');
  };

  if (!token) return null;

  return (
    <nav className="navbar">
      <div className="nav-brand">📈 Trading Assistant</div>
      <div className="nav-menu">
        <div className="nav-group">
          <span className="nav-group-label">💼 REAL ACCT</span>
          <Link className="nav-link" to="/">Dashboard</Link>
          <Link className="nav-link" to="/real-options">Option Chain</Link>
          <Link className="nav-link" to="/real-analytics">Analytics</Link>
        </div>
        <div className="nav-group">
          <span className="nav-group-label">🎮 DEMO TRADING</span>
          <Link className="nav-link" to="/virtual">Dashboard</Link>
          <Link className="nav-link" to="/virtual-options">Option Chain</Link>
          <Link className="nav-link" to="/virtual-analytics">Analytics</Link>
        </div>
      </div>
      <button className="btn-logout" onClick={handleLogout}>Logout 🚪</button>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Real Account Routes */}
        <Route path="/" element={<ProtectedRoute><RealDashboard /></ProtectedRoute>} />
        <Route path="/real-options" element={<ProtectedRoute><RealTrading /></ProtectedRoute>} />
        <Route path="/real-analytics" element={<ProtectedRoute><Analytics mode="real" /></ProtectedRoute>} />

        {/* Virtual Demo Account Routes */}
        <Route path="/virtual" element={<ProtectedRoute><VirtualDashboard /></ProtectedRoute>} />
        <Route path="/virtual-options" element={<ProtectedRoute><VirtualTrading /></ProtectedRoute>} />
        <Route path="/virtual-analytics" element={<ProtectedRoute><Analytics mode="virtual" /></ProtectedRoute>} />
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;