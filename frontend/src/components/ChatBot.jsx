import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API } from '../config/api';

function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const token = localStorage.getItem('token');

  // Load history when opening chat
  useEffect(() => {
    if (isOpen && token) {
      fetchHistory();
    }
  }, [isOpen, token]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/chat/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setMessages(res.data.data);
      }
    } catch (err) {
      console.log('Error fetching chat history:', err.message);
    }
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading || !token) return;

    const userText = input;
    setInput('');
    setLoading(true);

    // Optimistically add user message to list
    setMessages(prev => [...prev, { role: 'user', content: userText, timestamp: new Date() }]);

    try {
      const res = await axios.post(
        `${API}/chat`,
        { message: userText },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply, timestamp: new Date() }]);
      }
    } catch (err) {
      console.log('Error posting chat query:', err.message);
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: 'Error: Failed to connect to the assistant server. Please check your credentials or network and try again.',
          timestamp: new Date()
        }
      ]);
    }
    setLoading(false);
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear your conversation history?')) return;
    try {
      const res = await axios.delete(`${API}/chat/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setMessages([]);
      }
    } catch (err) {
      console.log('Failed to clear chat history:', err.message);
    }
  };

  if (!token) return null;

  return (
    <div className="chatbot-container">
      
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="chatbot-toggle"
        >
          💬
        </button>
      )}

      {/* Expanded Chat Window */}
      {isOpen && (
        <div className="chatbot-window">
          
          {/* Header */}
          <div style={{
            padding: '16px',
            background: 'linear-gradient(135deg, #10b981 0%, #2563eb 100%)',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', fontFamily: "'Space Grotesk', sans-serif" }}>Chanakya Assistant</h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', opacity: 0.85 }}>Platform Guide & Portfolio Advisor</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button 
                onClick={handleClearHistory} 
                style={{ background: 'none', border: 'none', color: '#ffffff', opacity: 0.8, cursor: 'pointer', fontSize: '14px' }}
                title="Clear Conversation"
              >
                🗑️
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer' }}
                title="Close Chat"
              >
                ×
              </button>
            </div>
          </div>

          {/* Messages list */}
          <div style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            
            {/* Welcome msg */}
            {messages.length === 0 && (
              <div style={{
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '13px',
                color: '#475569',
                lineHeight: '1.5'
              }}>
                👋 Hello! I am your <b>Chanakya Assistant</b>. Ask me support queries like <i>"How do I set up a trailing stop loss?"</i> or ask about your active trades: <i>"Show my open positions."</i>
              </div>
            )}

            {/* Chat history list */}
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <div 
                  key={index} 
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    background: isUser ? '#2563eb' : '#ffffff',
                    color: isUser ? '#ffffff' : '#0f172a',
                    border: isUser ? 'none' : '1px solid #e2e8f0',
                    padding: '10px 14px',
                    borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    whiteSpace: 'pre-line'
                  }}
                >
                  {msg.content}
                </div>
              );
            })}

            {/* Loading / Generating spinner */}
            {loading && (
              <div 
                style={{
                  alignSelf: 'flex-start',
                  background: '#ffffff',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                  padding: '10px 14px',
                  borderRadius: '12px 12px 12px 2px',
                  fontSize: '13px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>⏳ Assistant is thinking...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input area */}
          <form 
            onSubmit={handleSend}
            style={{
              padding: '12px',
              borderTop: '1px solid #e2e8f0',
              background: '#ffffff',
              display: 'flex',
              gap: '8px'
            }}
          >
            <input
              type="text"
              placeholder="Ask Chanakya..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#10b981'}
              onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              style={{
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #10b981 0%, #2563eb 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                opacity: (!input.trim() || loading) ? 0.6 : 1,
                transition: 'opacity 0.2s'
              }}
            >
              Send
            </button>
          </form>

        </div>
      )}

    </div>
  );
}

export default ChatBot;
