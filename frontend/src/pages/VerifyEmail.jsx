import React, { useState } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { API } from '../config/api';

function VerifyEmail() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
      toast.error('Please enter a valid 6-digit verification code!');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/verify-email`, { code }, { headers });
      if (res.data.success) {
        toast.success(res.data.message || 'Email verified successfully! 🎉');
        // Let state propagate and navigate to homepage
        setTimeout(() => {
          navigate('/');
          window.location.reload(); // Reload to update navbar/context states cleanly
        }, 1500);
      } else {
        toast.error(res.data.message || 'Verification failed!');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error verifying account!');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await axios.post(`${API}/auth/resend-verification`, {}, { headers });
      if (res.data.success) {
        toast.success(res.data.message || 'New verification code sent! Check your inbox.');
      } else {
        toast.error(res.data.message || 'Failed to resend code.');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error resending code!');
    } finally {
      setResending(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="login-page">
      <Toaster position="top-right" />
      <div className="login-card">
        <h1>🔑 Verify Your Email</h1>
        <p className="login-subtitle">We have sent a 6-digit verification code to your email address.</p>

        <div style={{ margin: '15px 0 5px', padding: '10px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', color: '#b45309', fontSize: '11px', textAlign: 'center', lineHeight: '1.4' }}>
          ✉️ Cannot find the email? <b>Please check your Spam or Junk folder</b> and mark it as "Not Spam" to receive future codes directly in your inbox.
        </div>

        <form onSubmit={handleVerify} style={{ marginTop: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <input
              type="text"
              maxLength="6"
              placeholder="e.g. 123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} // only digits
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '18px',
                textAlign: 'center',
                letterSpacing: '8px',
                fontWeight: '700',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)',
              transition: 'background-color 0.2s',
              marginBottom: '15px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          >
            {loading ? 'Verifying Account...' : 'Verify Code'}
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '12px' }}>
          <button
            type="button"
            disabled={resending}
            onClick={handleResend}
            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: '600' }}
          >
            {resending ? 'Sending...' : '🔄 Resend Code'}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: '600' }}
          >
            🚪 Logout & Back
          </button>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
