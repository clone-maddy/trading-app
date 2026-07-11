import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { API } from '../config/api';

function Account() {
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    password: '',
    angelApiKey: '',
    angelClientId: '',
    angelMpin: '',
    angelTotpSecret: '',
    telegramChatId: '',
    tradingMode: 'virtual',
    _id: ''
  });
  const [loading, setLoading] = useState(false);
  const [botUsername, setBotUsername] = useState('ChanakyaTrading_bot');

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/auth/me`, { headers });
      if (res.data.success && res.data.user) {
        const u = res.data.user;
        if (res.data.telegramBotUsername) {
          setBotUsername(res.data.telegramBotUsername);
        }
        setProfile({
          name: u.name || '',
          email: u.email || '',
          password: '', // do not display password
          angelApiKey: u.angelApiKey || '',
          angelClientId: u.angelClientId || '',
          angelMpin: u.angelMpin || '',
          angelTotpSecret: u.angelTotpSecret || '',
          telegramChatId: u.telegramChatId || '',
          tradingMode: u.tradingMode || 'virtual',
          _id: u._id || ''
        });
      }
    } catch (error) {
      toast.error('Failed to load profile data!');
    }
    setLoading(false);
  };

  const handleInputChange = (field, val) => {
    setProfile(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Build update payload
      const payload = { ...profile };
      // Omit api key since platform uses global key
      delete payload.angelApiKey;
      delete payload._id;
      // If password field is empty, do not submit it
      if (!payload.password) {
        delete payload.password;
      }

      const res = await axios.put(`${API}/auth/me`, payload, { headers });
      if (res.data.success) {
        toast.success(res.data.message);

        // Update local profile state
        const u = res.data.user;
        setProfile(prev => ({
          ...prev,
          name: u.name,
          email: u.email,
          tradingMode: u.tradingMode,
          telegramChatId: u.telegramChatId,
          password: '' // Clear password input
        }));
      } else {
        toast.error(res.data.message || 'Failed to update profile!');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error saving profile updates!');
    }
    setLoading(false);
  };

  return (
    <div className="app">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="header">
        <div>
          <h1>⚙️ Account Settings</h1>
          <p className="subtitle">Manage broker credentials, profile settings, and default trading mode</p>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>⏳ Loading details...</div>}

      {!loading && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Default Workspace Trading Mode */}
          <div className="settings-card" style={{ margin: 0, padding: '24px' }}>
            <h2>🎯 Active Trading Mode Preference</h2>
            <p className="subtitle" style={{ marginBottom: '20px' }}>
              Select which dashboard (Real vs. Demo paper trading) you want as your default landing workspace.
            </p>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <label
                style={{
                  flex: 1,
                  minWidth: '150px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  background: profile.tradingMode === 'virtual' ? '#eff6ff' : '#f8fafc',
                  border: profile.tradingMode === 'virtual' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '700'
                }}
              >
                <input
                  type="radio"
                  name="tradingMode"
                  value="virtual"
                  checked={profile.tradingMode === 'virtual'}
                  onChange={() => handleInputChange('tradingMode', 'virtual')}
                  style={{ width: '18px', height: '18px' }}
                />
                <div>
                  <span style={{ display: 'block', color: '#1e293b' }}>🎮 Virtual Demo Account</span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>Default to simulated paper trading</span>
                </div>
              </label>

              <label
                style={{
                  flex: 1,
                  minWidth: '150px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  background: profile.tradingMode === 'real' ? '#f0fdf4' : '#f8fafc',
                  border: profile.tradingMode === 'real' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '700'
                }}
              >
                <input
                  type="radio"
                  name="tradingMode"
                  value="real"
                  checked={profile.tradingMode === 'real'}
                  onChange={() => handleInputChange('tradingMode', 'real')}
                  style={{ width: '18px', height: '18px' }}
                />
                <div>
                  <span style={{ display: 'block', color: '#1e293b' }}>💼 Real Broker Account</span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>Default to live AngelOne account trading</span>
                </div>
              </label>
            </div>
          </div>

          <div className="account-grid">

            {/* Left Column: Personal info & Telegram */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Profile Details */}
              <div className="settings-card" style={{ margin: 0, padding: '24px' }}>
                <h2>👤 Personal Profile</h2>
                <p className="subtitle" style={{ marginBottom: '20px' }}>Your user identification details</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div className="input-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      required
                      value={profile.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                    />
                  </div>

                  <div className="input-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      required
                      value={profile.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                    />
                  </div>

                  <div className="input-group">
                    <label>New Password (leave blank to keep current)</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={profile.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Telegram config */}
              {/* Telegram config */}
              <div className="settings-card" style={{ margin: 0, padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h2 style={{ margin: 0 }}>✈️ Telegram Integration</h2>
                  <span onClick={fetchProfile} style={{ fontSize: '11px', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontWeight: '600' }}>
                    🔄 Refresh Status
                  </span>
                </div>
                <p className="subtitle" style={{ marginBottom: '20px' }}>Enable instant phone push alert notifications</p>

                {profile.telegramChatId ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '16px', borderRadius: '8px', color: '#166534', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '13px' }}>
                        <span>✅ Connected to Telegram Alerts</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#15803d' }}>
                        Active Chat ID: <code>{profile.telegramChatId}</code>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInputChange('telegramChatId', '')}
                      style={{
                        padding: '10px 15px',
                        background: '#fee2e2',
                        color: '#991b1b',
                        border: '1px solid #fca5a5',
                        borderRadius: '6px',
                        fontWeight: '700',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fecaca'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                    >
                      🔌 Disconnect Telegram Alerts
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <a
                      href={`https://t.me/${botUsername}?start=${profile._id}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '12px',
                        background: '#0088cc',
                        color: '#ffffff',
                        borderRadius: '8px',
                        fontWeight: '700',
                        fontSize: '14px',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0, 136, 204, 0.2)',
                        boxSizing: 'border-box'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0077b3'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0088cc'}
                    >
                      💬 Connect to Telegram Alerts
                    </a>

                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                      Click the button above to open Telegram. Clicking <b>Start</b> in Telegram will automatically link your account and send a verification confirmation!
                    </p>

                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '15px', marginTop: '5px' }}>
                      <label style={{ fontSize: '11px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '6px' }}>Or enter Chat ID manually:</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="e.g. 123456789"
                          value={profile.telegramChatId}
                          onChange={(e) => handleInputChange('telegramChatId', e.target.value)}
                          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', flex: 1 }}
                        />
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#94a3b8' }}>
                        Manually enter numerical ID from <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>@userinfobot</a>.
                      </p>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Right Column: Broker credentials */}
            <div className="settings-card" style={{ margin: 0, padding: '24px' }}>
              <h2>🔑 AngelOne Broker Credentials</h2>
              <p className="subtitle" style={{ marginBottom: '20px' }}>Securely store MPIN, TOTP, and API keys to connect the feed</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className="input-group">
                  <label>AngelOne Client Code (ID)</label>
                  <input
                    type="text"
                    placeholder="e.g. A123456"
                    value={profile.angelClientId}
                    onChange={(e) => handleInputChange('angelClientId', e.target.value)}
                  />
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                    Your 6-character unique login ID from AngelOne (visible in your profile page inside the AngelOne app).
                  </p>
                </div>

                <div className="input-group">
                  <label>MPIN (Passcode)</label>
                  <input
                    type="password"
                    placeholder="••••"
                    value={profile.angelMpin}
                    onChange={(e) => handleInputChange('angelMpin', e.target.value)}
                  />
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                    The 4-digit numeric passcode you use to log into your AngelOne app.
                  </p>
                </div>



                <div className="input-group">
                  <label>TOTP Secret Key (Base32)</label>
                  <input
                    type="password"
                    placeholder="Enter Base32 token secret"
                    value={profile.angelTotpSecret}
                    onChange={(e) => handleInputChange('angelTotpSecret', e.target.value)}
                  />
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                    In your AngelOne app, go to Profile -> Enable TOTP, and copy the alphanumeric secret key text shown next to the QR code.
                  </p>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px', fontSize: '11px', color: '#166534' }}>
                  🔐 <b>Security Notice</b>: Your credentials are encrypted and saved securely to enable automated background session connection.
                </div>
              </div>
            </div>

          </div>

          {/* Form submit button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              type="submit"
              style={{
                padding: '12px 30px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
              }}
            >
              💾 Save Account Settings
            </button>
          </div>

        </form>
      )}

    </div>
  );
}

export default Account;
