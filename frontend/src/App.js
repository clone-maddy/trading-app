import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { io } from 'socket.io-client';
import RealDashboard from './pages/RealDashboard';
import RealTrading from './pages/RealTrading';
import VirtualDashboard from './pages/VirtualDashboard';
import VirtualTrading from './pages/VirtualTrading';
import Analytics from './pages/Analytics';
import Login from './pages/Login';
import Alerts from './pages/Alerts';
import Account from './pages/Account';
import Home from './pages/Home';
import './App.css';

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

// Home redirect wrapper based on user trading mode preference
function HomeRedirect() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('virtual');
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    axios.get('http://localhost:5000/api/auth/me', { headers })
      .then(res => {
        if (res.data.success && res.data.user) {
          setMode(res.data.user.tradingMode || 'virtual');
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [token]);

  if (!token) return <Navigate to="/login" replace />;
  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>⏳ Loading your workspace...</div>;

  if (mode === 'real') {
    return <Navigate to="/real" replace />;
  }
  return <Navigate to="/virtual" replace />;
}

function Navbar() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [unseenCount, setUnseenCount] = useState(0);
  const [tradingMode, setTradingMode] = useState('virtual');

  const handleLogout = () => {
    localStorage.removeItem('token');
    toast.success('Logged out!');
    navigate('/login');
  };

  const fetchUnseenCount = async () => {
    if (!token) return;
    try {
      const res = await axios.get('http://localhost:5000/api/alerts/unseen', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setUnseenCount(res.data.count);
      }
    } catch (e) {
      console.log('Error fetching unseen count:', e.message);
    }
  };

  const fetchProfileMode = async () => {
    if (!token) return;
    try {
      const res = await axios.get('http://localhost:5000/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success && res.data.user) {
        setTradingMode(res.data.user.tradingMode || 'virtual');
      }
    } catch (e) {
      console.log('Error fetching mode in navbar:', e.message);
    }
  };

  useEffect(() => {
    if (!token) return;

    fetchUnseenCount();
    fetchProfileMode();

    const socket = io('http://localhost:5000', { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      socket.emit('register-user', { token });
    });

    socket.on('ema_crossover_alert', () => {
      setUnseenCount(prev => prev + 1);
    });

    const interval = setInterval(() => {
      fetchUnseenCount();
      fetchProfileMode();
    }, 5000);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [token]);

  if (!token) return null;

  return (
    <nav className="navbar">
      <Link className="nav-brand" to="/" style={{ textDecoration: 'none' }}>Chanakya</Link>
      <div className="nav-menu">
        {tradingMode === 'real' ? (
          <>
            <Link className="nav-link" to="/real">Dashboard</Link>
            <Link className="nav-link" to="/real-options">Option Chain</Link>
            <Link className="nav-link" to="/real-analytics">Analytics</Link>
          </>
        ) : (
          <>
            <Link className="nav-link" to="/virtual">Dashboard</Link>
            <Link className="nav-link" to="/virtual-options">Option Chain</Link>
            <Link className="nav-link" to="/virtual-analytics">Analytics</Link>
          </>
        )}
        
        {/* Alerts Link with text label and bell badge */}
        <Link 
          className="nav-link" 
          to="/alerts"
          style={{ 
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          Alerts
          {unseenCount > 0 && (
            <span style={{
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontSize: '9px',
              fontWeight: '700',
              borderRadius: '50%',
              padding: '1px 5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: '1'
            }}>
              {unseenCount}
            </span>
          )}
        </Link>

        {/* Account Link with text label */}
        <Link className="nav-link" to="/account">
          Account
        </Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
        <button className="btn-logout" onClick={handleLogout}>Logout</button>
      </div>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Public Homepage Landing Route */}
        <Route path="/" element={<Home />} />
        
        {/* Real Account Routes */}
        <Route path="/real" element={<ProtectedRoute><RealDashboard /></ProtectedRoute>} />
        <Route path="/real-options" element={<ProtectedRoute><RealTrading /></ProtectedRoute>} />
        <Route path="/real-analytics" element={<ProtectedRoute><Analytics mode="real" /></ProtectedRoute>} />

        {/* Virtual Demo Account Routes */}
        <Route path="/virtual" element={<ProtectedRoute><VirtualDashboard /></ProtectedRoute>} />
        <Route path="/virtual-options" element={<ProtectedRoute><VirtualTrading /></ProtectedRoute>} />
        <Route path="/virtual-analytics" element={<ProtectedRoute><Analytics mode="virtual" /></ProtectedRoute>} />
        
        {/* Alerts Center Route */}
        <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />

        {/* Account Settings Route */}
        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;