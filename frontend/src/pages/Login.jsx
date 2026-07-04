import React, { useState } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const API = 'http://localhost:5000/api';

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
        toast.success(isLogin ? 'Logged in!' : 'Registered successfully!');
        navigate('/');
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
        <h1>Chanakya</h1>
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