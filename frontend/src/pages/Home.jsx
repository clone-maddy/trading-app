import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = 'http://localhost:5000/api';

function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tradingMode, setTradingMode] = useState('virtual');
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) return;
    
    // Fetch user's default trading mode preference
    axios.get(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => {
      if (res.data.success && res.data.user) {
        setTradingMode(res.data.user.tradingMode || 'virtual');
      }
    })
    .catch(err => {
      console.log('Error fetching user mode on homepage:', err.message);
    });
  }, [token]);

  const handleLaunchWorkspace = () => {
    if (!token) {
      navigate('/login');
      return;
    }
    setLoading(true);
    // Dynamic redirect based on preferences
    if (tradingMode === 'real') {
      navigate('/real');
    } else {
      navigate('/virtual');
    }
    setLoading(false);
  };

  return (
    <div className="app" style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px' }}>
      
      {/* Hero Section */}
      <div style={{ textAlign: 'center', marginBottom: '60px', padding: '40px 20px', background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
        <h1 style={{ 
          fontFamily: "'Space Grotesk', sans-serif", 
          fontSize: '48px', 
          fontWeight: 800, 
          background: 'linear-gradient(135deg, #10b981 0%, #2563eb 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '16px',
          textTransform: 'uppercase',
          letterSpacing: '-1px'
        }}>
          Chanakya
        </h1>
        <p style={{ fontSize: '18px', color: '#475569', maxWidth: '600px', margin: '0 auto 28px', lineHeight: '1.6' }}>
          An intelligent options tracking and strategy assistant built to simplify your analysis, send instant alerts, and manage risk automatically.
        </p>

        <button 
          onClick={handleLaunchWorkspace}
          disabled={loading}
          style={{
            padding: '14px 36px',
            background: 'linear-gradient(135deg, #10b981 0%, #2563eb 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          {token ? 'Launch Trading Workspace →' : 'Get Started / Login →'}
        </button>
      </div>

      {/* Feature Section Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '28px', color: '#0f172a', fontWeight: '800' }}>Comprehensive Trading Capabilities</h2>
        <p className="subtitle">Everything you need to analyze, monitor, and execute options systematically</p>
      </div>

      {/* Feature Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        
        {/* Feature 1 */}
        <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
          <h3 style={{ fontSize: '18px', color: '#0f172a', marginBottom: '8px', fontWeight: '700' }}>Market Analysis Dashboard</h3>
          <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
            View Calls and Puts in real-time. Automatically sums option interest levels around the spot price to evaluate key support and resistance zones instantly.
          </p>
        </div>

        {/* Feature 2 */}
        <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔔</div>
          <h3 style={{ fontSize: '18px', color: '#0f172a', marginBottom: '8px', fontWeight: '700' }}>Moving Average Alerts</h3>
          <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
            Monitors trend lines in the background. Get alerted immediately when major trends cross, helping you spot potential market entries and exits.
          </p>
        </div>

        {/* Feature 3 */}
        <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>✉️</div>
          <h3 style={{ fontSize: '18px', color: '#0f172a', marginBottom: '8px', fontWeight: '700' }}>Instant Mobile Alerts</h3>
          <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
            Forwards notifications directly to your phone via Telegram. Receive instant sound alerts even when your laptop is closed or the website is shut down.
          </p>
        </div>

        {/* Feature 4 */}
        <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎯</div>
          <h3 style={{ fontSize: '18px', color: '#0f172a', marginBottom: '8px', fontWeight: '700' }}>Automated Risk Controls</h3>
          <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
            Set auto-exits to lock in profits or stop losses automatically. Supports trailing parameters to secure gains as the market rises.
          </p>
        </div>

        {/* Feature 5 */}
        <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎮</div>
          <h3 style={{ fontSize: '18px', color: '#0f172a', marginBottom: '8px', fontWeight: '700' }}>Practice Paper Trading</h3>
          <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
            Practice strategies risk-free with a virtual account and simulated balance using live market price feeds to hone your options trading skills.
          </p>
        </div>

        {/* Feature 6 */}
        <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>💼</div>
          <h3 style={{ fontSize: '18px', color: '#0f172a', marginBottom: '8px', fontWeight: '700' }}>Live Broker Account</h3>
          <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
            Connect your broker account credentials securely. Submit actual orders directly from the option chain layout in real-time.
          </p>
        </div>

      </div>

      {/* Contact Support Section */}
      <div style={{ 
        marginTop: '60px', 
        padding: '40px 20px', 
        borderTop: '1px solid #e2e8f0', 
        textAlign: 'center', 
        background: '#f8fafc', 
        borderRadius: '16px' 
      }}>
        <h2 style={{ fontSize: '24px', color: '#0f172a', fontWeight: '800', marginBottom: '8px' }}>📬 Need Help or Have Feedback?</h2>
        <p style={{ fontSize: '14px', color: '#475569', maxWidth: '500px', margin: '0 auto 20px', lineHeight: '1.6' }}>
          Have any questions, feature suggestions, or business inquiries? Reach out to our support team and we will get back to you shortly.
        </p>
        <a 
          href="https://mail.google.com/mail/?view=cm&fs=1&to=support.chanakya@gmail.com&su=Feedback%20and%20Support%20-%20Chanakya" 
          target="_blank"
          rel="noopener noreferrer"
          style={{ 
            fontSize: '16px', 
            color: '#2563eb', 
            fontWeight: '700', 
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            border: '2px solid #2563eb',
            padding: '10px 24px',
            borderRadius: '8px',
            transition: 'background-color 0.2s, color 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#2563eb';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#2563eb';
          }}
        >
          ✉️ contact via Gmail
        </a>
      </div>

    </div>
  );
}

export default Home;
