import React, { useState } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { API } from '../config/api';

import logo from '../assets/logo.png';

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!form.email || !form.password) {
      toast.error('Please fill in all fields!');
      return;
    }
    if (!isLogin && !form.name) {
      toast.error('Please enter your name!');
      return;
    }
    setLoading(true);
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password };
      const res = await axios.post(`${API}${endpoint}`, payload);
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
        if (res.data.needsVerification) {
          toast.success('Account verification code sent!');
          navigate('/verify-email');
        } else {
          toast.success(isLogin ? 'Logged in!' : 'Registered successfully!');
          navigate('/');
        }
      } else {
        toast.error(res.data.message || 'Something went wrong!');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Something went wrong!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <Toaster position="top-right" />
      <div className="login-card">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '15px' }}>
          <img src={logo} alt="Chanakya Logo" style={{ width: '90px', height: '90px', display: 'block', borderRadius: '16px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)' }} />
          <h1 style={{ marginTop: '12px' }}>Chanakya</h1>
        </div>
        <p className="login-subtitle">Strategic options analysis and trading platform</p>

        <div className="login-tabs">
          <button className={isLogin ? 'tab active' : 'tab'} onClick={() => setIsLogin(true)}>
            Login
          </button>
          <button className={!isLogin ? 'tab active' : 'tab'} onClick={() => setIsLogin(false)}>
            Register
          </button>
        </div>

        <div className="login-form">
          {!isLogin && (
            <div className="input-group">
              <label>Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          )}
          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <button className="btn-start" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Please wait...' : isLogin ? '🔐 Login' : '📝 Register'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
