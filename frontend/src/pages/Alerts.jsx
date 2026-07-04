import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { io } from 'socket.io-client';

const API = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

function Alerts() {
  const [activeTab, setActiveTab] = useState('history');
  const [alerts, setAlerts] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Connect Socket.IO to listen for real-time alerts
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('register-user', { token });
      console.log('Alerts page socket connected and registered');
    });

    socket.on('ema_crossover_alert', (newAlert) => {
      // Add new alert to history list at the top
      setAlerts(prev => [newAlert, ...prev]);
      
      // Play system notification sound
      try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/911/911-200.wav');
        audio.volume = 0.5;
        audio.play();
      } catch (err) {
        console.log('Sound play error:', err.message);
      }

      toast(`🚨 Alert triggered for ${newAlert.symbol}!`, {
        duration: 5000,
        icon: newAlert.direction === 'bullish' ? '🟢' : '🔴'
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    fetchAlerts();
    fetchConfigs();
    fetchTelegramId();
  }, []);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/alerts`, { headers });
      if (res.data.success) {
        setAlerts(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to load alert history!');
    }
    setLoading(false);
  };

  const fetchConfigs = async () => {
    try {
      const res = await axios.get(`${API}/alerts/config`, { headers });
      if (res.data.success) {
        setConfigs(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to load alert configurations!');
    }
  };

  const fetchTelegramId = async () => {
    try {
      // Decode user profile to read telegram ID, or we can just fetch it from backend user object
      const res = await axios.get(`${API}/auth/me`, { headers }).catch(async () => {
        // Fallback: decode JWT locally
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const userRes = await axios.get(`${API}/auth/user/${payload.userId}`, { headers });
          return userRes;
        } catch (e) {
          return { data: { success: false } };
        }
      });
      if (res.data.success && res.data.data?.telegramChatId) {
        setTelegramChatId(res.data.data.telegramChatId);
      }
    } catch (error) {
      console.log('Failed to fetch user Telegram ID', error.message);
    }
  };

  const handleMarkSeen = async (id) => {
    try {
      const res = await axios.patch(`${API}/alerts/${id}/seen`, {}, { headers });
      if (res.data.success) {
        setAlerts(prev => prev.map(a => a._id === id ? { ...a, seen: true } : a));
        toast.success('Alert marked as seen');
      }
    } catch (error) {
      toast.error('Error marking alert as seen!');
    }
  };

  const handleMarkAllSeen = async () => {
    try {
      const res = await axios.patch(`${API}/alerts/seen-all`, {}, { headers });
      if (res.data.success) {
        setAlerts(prev => prev.map(a => ({ ...a, seen: true })));
        toast.success('All alerts marked as seen');
      }
    } catch (error) {
      toast.error('Error marking all alerts as seen!');
    }
  };

  const handleDeleteAlert = async (id) => {
    try {
      const res = await axios.delete(`${API}/alerts/${id}`, { headers });
      if (res.data.success) {
        setAlerts(prev => prev.filter(a => a._id !== id));
        toast.success('Alert deleted');
      }
    } catch (error) {
      toast.error('Error deleting alert!');
    }
  };

  const handleSaveTelegram = async () => {
    try {
      const res = await axios.post(`${API}/alerts/telegram-chat-id`, { telegramChatId }, { headers });
      if (res.data.success) {
        toast.success(res.data.message);
      }
    } catch (error) {
      toast.error('Error updating Telegram Chat ID!');
    }
  };

  const handleAddMonitor = async (e) => {
    e.preventDefault();
    if (!customToken.trim()) {
      toast.error('Please enter a valid stock token!');
      return;
    }
    try {
      const res = await axios.post(`${API}/alerts/config`, { token: customToken.trim() }, { headers });
      if (res.data.success) {
        toast.success(res.data.message);
        setCustomToken('');
        fetchConfigs();
      } else {
        toast.error(res.data.message);
      }
    } catch (error) {
      toast.error('Error adding alert config!');
    }
  };

  const handleRemoveMonitor = async (tokenVal) => {
    try {
      const res = await axios.delete(`${API}/alerts/config/${tokenVal}`, { headers });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchConfigs();
      }
    } catch (error) {
      toast.error('Error removing alert configuration!');
    }
  };

  return (
    <div className="app">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="header">
        <div>
          <h1>🔔 Alerts Center</h1>
          <p className="subtitle">Configure and monitor server-side price targets and indicators</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Main Panel */}
        <div>
          <div className="tabs" style={{ marginBottom: '20px' }}>
            <button 
              className={activeTab === 'history' ? 'tab active' : 'tab'} 
              onClick={() => setActiveTab('history')}
            >
              📋 Triggered History ({alerts.length})
            </button>
            <button 
              className={activeTab === 'monitors' ? 'tab active' : 'tab'} 
              onClick={() => setActiveTab('monitors')}
            >
              👁️ Active Monitors ({configs.length})
            </button>
          </div>

          {activeTab === 'history' ? (
            <div className="positions-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Alert logs</h3>
                {alerts.some(a => !a.seen) && (
                  <button onClick={handleMarkAllSeen} style={{ padding: '6px 12px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '12px' }}>
                    Mark all as seen
                  </button>
                )}
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>⏳ Loading alert history...</div>
              ) : alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontStyle: 'italic' }}>
                  No alerts triggered yet. Set up active monitors and wait for the crossovers!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {alerts.map((alert) => (
                    <div 
                      key={alert._id} 
                      className="position-row" 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        background: alert.seen ? '#ffffff' : '#f0f9ff',
                        border: alert.seen ? '1px solid #e2e8f0' : '1px solid #bae6fd',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        margin: 0
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '15px', color: '#0f172a' }}>{alert.symbol}</strong>
                          <span 
                            className={`type-badge ${alert.direction === 'bullish' || alert.direction === 'above' ? 'ce' : 'sell'}`}
                            style={{ textTransform: 'uppercase', fontSize: '10px', padding: '2px 6px' }}
                          >
                            {alert.type === 'ema_crossover' 
                              ? `EMA Crossover: ${alert.direction}` 
                              : alert.type === 'price' 
                              ? `Price Target: ${alert.direction}` 
                              : `${alert.type || 'Alert'}: ${alert.direction}`}
                          </span>
                          {!alert.seen && (
                            <span style={{ fontSize: '9px', fontWeight: '700', background: '#0284c7', color: '#ffffff', padding: '1px 5px', borderRadius: '4px' }}>NEW</span>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                          Triggered: <b>{new Date(alert.triggeredAt).toLocaleString()}</b>
                          {alert.ema9Value != null && alert.ema21Value != null && (
                            <>
                              {' '}| EMA9: <b>₹{alert.ema9Value.toFixed(2)}</b> | EMA21: <b>₹{alert.ema21Value.toFixed(2)}</b>
                            </>
                          )}
                          {alert.price != null && (
                            <>
                              {' '}| Trigger Price: <b>₹{alert.price.toFixed(2)}</b>
                            </>
                          )}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {!alert.seen && (
                          <button 
                            onClick={() => handleMarkSeen(alert._id)}
                            style={{ border: 'none', background: '#0ea5e9', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                          >
                            ✓ Seen
                          </button>
                        )}
                        <button 
                          onClick={() => handleDeleteAlert(alert._id)}
                          style={{ border: 'none', background: '#ef4444', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          ✕ Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="positions-card" style={{ padding: '20px' }}>
              <h3>Add Stock to Monitor</h3>
              <p className="subtitle" style={{ marginBottom: '15px' }}>
                You can also configure alert monitors directly by clicking the 🔔 icon next to any contract in the Option Chain tables.
              </p>
              
              <form onSubmit={handleAddMonitor} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                <input
                  type="text"
                  placeholder="Enter Stock Token ID (e.g. 54321)"
                  value={customToken}
                  onChange={(e) => setCustomToken(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '13px'
                  }}
                />
                <button type="submit" style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                  Add Monitor
                </button>
              </form>

              <h3>Currently Monitored Contracts</h3>
              <p className="subtitle" style={{ marginBottom: '15px' }}>Websocket handles candle-checks continuously for these options</p>

              {configs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontStyle: 'italic' }}>
                  No active monitors. Go to the Option Chain pages to subscribe!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {configs.map((cfg) => (
                    <div 
                      key={cfg._id} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '10px 14px', 
                        background: '#f8fafc', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '6px' 
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>{cfg.symbol}</strong>
                        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '10px' }}>Token: {cfg.token}</span>
                      </div>
                      <button 
                        onClick={() => handleRemoveMonitor(cfg.token)} 
                        style={{ border: 'none', background: 'none', color: '#ef4444', fontWeight: '600', cursor: 'pointer', fontSize: '12px' }}
                      >
                        ⛔ Stop Monitoring
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Telegram Settings Card */}
          <div className="settings-card" style={{ margin: 0, padding: '20px' }}>
            <h3 style={{ marginBottom: '8px' }}>✈️ Telegram Integration</h3>
            <p className="subtitle" style={{ marginBottom: '15px', fontSize: '12px' }}>
              Receive instant alerts with sound on your phone or laptop lock-screen even when this website is closed!
            </p>
            
            <div className="input-group" style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px' }}>Your Telegram Chat ID</label>
              <input
                type="text"
                placeholder="e.g. 987654321"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                style={{ width: '100%', padding: '8px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>
            
            <button 
              onClick={handleSaveTelegram} 
              style={{ width: '100%', padding: '8px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', marginBottom: '15px' }}
            >
              Save Chat ID
            </button>

            <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', color: '#475569' }}>
              <strong style={{ display: 'block', marginBottom: '4px' }}>How to setup for free:</strong>
              <ol style={{ paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>Open Telegram and search for <b>@userinfobot</b></li>
                <li>Start a chat with it; it will reply with your <b>Id</b> (numbers)</li>
                <li>Copy the ID and paste it above, then click save.</li>
                <li>Make sure you send a message to your custom bot so it is allowed to message you.</li>
              </ol>
            </div>
          </div>
          
        </div>

      </div>
    </div>
  );
}

export default Alerts;
