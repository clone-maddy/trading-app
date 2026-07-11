import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { io } from 'socket.io-client';
import StockChart from '../components/StockChart';
import { API, SOCKET_URL } from '../config/api';

const checkMarketOpen = () => {
  const istTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = istTime.getDay();
  if (day === 0 || day === 6) return false;
  
  const hour = istTime.getHours();
  const minute = istTime.getMinutes();
  const currentTime = hour * 60 + minute;
  
  const marketOpen = 9 * 60 + 15;  // 09:15 AM
  const marketClose = 15 * 60 + 30; // 03:30 PM
  
  return currentTime >= marketOpen && currentTime <= marketClose;
};

function RealDashboard() {
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [totalPnL, setTotalPnL] = useState(0);
  const [activeTab, setActiveTab] = useState('positions');
  const [isSettingsOpen, setIsSettingsOpen] = useState(window.innerWidth > 768);

  const [globalSettings, setGlobalSettings] = useState({
    targetProfit: '',
    stopLoss: '',
    partialProfitAt: '',
    partialProfitPercent: '50',
    useTrailingSL: false,
    trailAmount: '1000'
  });
  const [positionSettings, setPositionSettings] = useState({});
  const [runningSettings, setRunningSettings] = useState(null);
  const [activeChart, setActiveChart] = useState(null);

  const socketRef = useRef(null);
  const subscribedTokensRef = useRef([]);
  const positionsRef = useRef([]);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Connect Socket.IO on mount
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Real Dashboard Socket connected');
      socket.emit('register-user', { token });
      if (positionsRef.current.length > 0) {
        const tokens = positionsRef.current.map(pos => pos.symboltoken).filter(Boolean);
        if (tokens.length > 0) {
          subscribedTokensRef.current = tokens;
          socket.emit('subscribe-tokens', { tokens });
        }
      }
    });

    socket.on('price-update', (data) => {
      if (!data || !data.token || !data.ltp) return;

      setPositions(prev => {
        const updated = prev.map(pos => {
          if (pos.symboltoken === data.token) {
            const currentPrice = data.ltp;
            const pnl = (currentPrice - pos.buyPrice) * pos.quantity;
            return { ...pos, currentPrice, pnl };
          }
          return pos;
        });
        positionsRef.current = updated;
        const total = updated.reduce((sum, p) => sum + (p.pnl || 0), 0);
        setTotalPnL(total);
        return updated;
      });
    });

    socket.on('monitor-update', (data) => {
      if (data && data.mode === 'real') {
        setIsMonitoring(data.isMonitoring);
        setRunningSettings(data.settings);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    fetchPositions();
    fetchHistory();
    checkMonitorStatus();

    const interval = setInterval(() => {
      fetchPositions();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const fetchPositions = async () => {
    try {
      const res = await axios.get(`${API}/positions`, { headers });
      if (res.data.success) {
        setPositions(res.data.data);
        positionsRef.current = res.data.data;
        const total = res.data.data.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
        setTotalPnL(total);

        // Sub tokens
        const tokens = res.data.data.map(pos => pos.symboltoken).filter(Boolean);
        if (tokens.length > 0 && socketRef.current?.connected) {
          socketRef.current.emit('subscribe-tokens', { tokens });
        }
      }
    } catch (error) {
      console.log('Error fetching real positions:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/positions/history`, { headers });
      if (res.data.success) setHistory(res.data.data);
    } catch (error) {
      console.log('Error fetching trade book:', error);
    }
  };

  const checkMonitorStatus = async () => {
    try {
      const res = await axios.get(`${API}/monitor/status?mode=real`, { headers });
      setIsMonitoring(res.data.isMonitoring);
      setRunningSettings(res.data.settings || null);
    } catch (error) {
      console.log('Error checking status:', error);
    }
  };

  const startMonitor = async () => {
    if (!globalSettings.targetProfit || !globalSettings.stopLoss) {
      toast.error('Please enter Target Profit and Stop Loss!');
      return;
    }
    try {
      const payload = {
        targetProfit: Number(globalSettings.targetProfit),
        stopLoss: Number(globalSettings.stopLoss),
        partialProfitAt: Number(globalSettings.partialProfitAt || 0),
        partialProfitPercent: Number(globalSettings.partialProfitPercent || 50),
        useTrailingSL: globalSettings.useTrailingSL,
        trailAmount: Number(globalSettings.trailAmount || 1),
        mode: 'real'
      };
      const res = await axios.post(`${API}/monitor/start`, payload, { headers });
      if (res.data.success) {
        setIsMonitoring(true);
        setRunningSettings(payload);
        toast.success(res.data.message);
        // Fetch live trailing data after backend computes first tick
        setTimeout(() => checkMonitorStatus(), 3000);
      } else {
        toast.error(res.data.message);
      }
    } catch (error) {
      toast.error('Error starting monitor!');
    }
  };

  const stopMonitor = async () => {
    try {
      const res = await axios.post(`${API}/monitor/stop`, { mode: 'real' }, { headers });
      if (res.data.success) {
        setIsMonitoring(false);
        setRunningSettings(null);
        toast.success(res.data.message);
      }
    } catch (error) {
      toast.error('Error stopping monitor!');
    }
  };

  const closeRealPosition = async (pos) => {
    if (!window.confirm(`Close entire position of ${pos.symbol}?`)) return;
    try {
      const qty = Math.abs(pos.quantity);
      if (qty === 0) return;

      const res = await axios.post(`${API}/positions/order`, {
        variety: 'NORMAL',
        tradingsymbol: pos.symbol,
        symboltoken: pos.symboltoken,
        transactiontype: pos.quantity > 0 ? 'SELL' : 'BUY',
        exchange: pos.exchange || 'NFO',
        ordertype: 'MARKET',
        producttype: pos.producttype || 'INTRADAY',
        duration: 'DAY',
        quantity: qty
      }, { headers });

      if (res.data.status) {
        toast.success('Market order placed to exit position!');
        fetchPositions();
        fetchHistory();
      } else {
        toast.error(res.data.message || 'Exit order failed!');
      }
    } catch (error) {
      toast.error('Error exiting position!');
    }
  };

  const updatePositionSetting = (symbol, field, value) => {
    setPositionSettings(prev => ({
      ...prev,
      [symbol]: { ...prev[symbol], [field]: value }
    }));
  };

  const savePositionSettings = async (symbol) => {
    const settings = positionSettings[symbol];
    if (!settings?.target || !settings?.stopLoss) {
      toast.error('Please enter both Target and Stop Loss!');
      return;
    }
    try {
      const res = await axios.post(`${API}/monitor/position-settings`, {
        symbol,
        target: Number(settings.target),
        stopLoss: Number(settings.stopLoss),
        useTrailingSL: !!settings.useTrailingSL,
        trailAmount: Number(settings.trailAmount || 1),
        mode: 'real'
      }, { headers });
      if (res.data.success) toast.success(`Settings saved for ${symbol}!`);
    } catch (error) {
      toast.error('Error saving position settings!');
    }
  };

  return (
    <div className="app">
      <Toaster position="top-right" />

      {!checkMarketOpen() && (
        <div style={{ 
          background: '#fffbeb', 
          border: '1px solid #fde68a', 
          color: '#b45309', 
          padding: '12px 16px', 
          borderRadius: '8px', 
          marginBottom: '20px', 
          fontSize: '13px', 
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚠️</span>
          <span>The Indian stock market is currently closed. Live price streams will resume during standard market hours (Mon - Fri, 9:15 AM - 3:30 PM IST).</span>
        </div>
      )}

      {/* Header */}
      <div className="header">
        <div>
          <h1>💼 Real Trading Dashboard</h1>
          <p className="subtitle">Track live AngelOne account positions and safety settings</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <div className={`status ${isMonitoring ? 'active' : 'inactive'}`}>
            {isMonitoring ? '🟢 Real Monitor Active' : '🔴 Real Monitor Inactive'}
          </div>
          {isMonitoring && runningSettings && (
            <div style={{ fontSize: '12px', color: '#475569', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '6px 12px', borderRadius: '8px', textAlign: 'right' }}>
              🎯 Target: <strong style={{ color: '#047857' }}>₹{Number(runningSettings.targetProfit || 0).toLocaleString()}</strong> | 🛑 SL: <strong style={{ color: '#b91c1c' }}>₹{Number(runningSettings.dynamicStopLoss != null ? runningSettings.dynamicStopLoss : runningSettings.stopLoss || 0).toLocaleString()}</strong>
              {runningSettings.useTrailingSL && (
                <span> | 🛡️ Trail Step: <strong style={{ color: '#0284c7' }}>₹{Number(runningSettings.trailAmount || 0).toLocaleString()}</strong></span>
              )}
              {runningSettings.useTrailingSL && runningSettings.maxPnL > 0 && (
                <span> | Peak P&L: <strong style={{ color: '#047857' }}>₹{Number(runningSettings.maxPnL || 0).toLocaleString()}</strong></span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Total PnL Card */}
      <div className={`pnl-card ${totalPnL >= 0 ? 'profit' : 'loss'}`}>
        <h2>Total Real Positions P&L</h2>
        <h1>₹{totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h1>
      </div>

      {/* Global Settings */}
      <div className="settings-card">
        <div 
          onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        >
          <h2 style={{ margin: 0, fontSize: '16px' }}>⚙️ Global P&L Monitor Settings (Real Account)</h2>
          <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{isSettingsOpen ? '▲' : '▼'}</span>
        </div>

        {isSettingsOpen && (
          <div style={{ marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
            <p className="subtitle">Execute automatic square-off orders in AngelOne when total P&L hits these thresholds</p>
            <div className="settings-grid">
              <div className="input-group">
                <label>🎯 Target Profit (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 20000"
                  value={globalSettings.targetProfit}
                  onChange={(e) => setGlobalSettings({...globalSettings, targetProfit: e.target.value})}
                />
              </div>
              <div className="input-group">
                <label>🛑 Stop Loss (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. -12000"
                  value={globalSettings.stopLoss}
                  onChange={(e) => setGlobalSettings({...globalSettings, stopLoss: e.target.value})}
                />
              </div>
              <div className="input-group">
                <label>📈 Partial Profit At (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 10000"
                  value={globalSettings.partialProfitAt}
                  onChange={(e) => setGlobalSettings({...globalSettings, partialProfitAt: e.target.value})}
                />
              </div>
              <div className="input-group">
                <label>📊 Partial Profit %</label>
                <input
                  type="number"
                  placeholder="e.g. 50"
                  value={globalSettings.partialProfitPercent}
                  onChange={(e) => setGlobalSettings({...globalSettings, partialProfitPercent: e.target.value})}
                />
              </div>
            </div>

            <div className="checkbox-group" style={{ margin: '15px 0', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={globalSettings.useTrailingSL}
                  onChange={(e) => setGlobalSettings({...globalSettings, useTrailingSL: e.target.checked})}
                  style={{ width: '18px', height: '18px' }}
                />
                🛡️ Enable Trailing Stop Loss
              </label>
              {globalSettings.useTrailingSL && (
                <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <label style={{ fontSize: '13px' }}>Trail Step (₹):</label>
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={globalSettings.trailAmount}
                    onChange={(e) => setGlobalSettings({...globalSettings, trailAmount: e.target.value})}
                    style={{ width: '100px', padding: '6px', background: '#0f0f1a', border: '1px solid #2a2a3d', color: '#fff', borderRadius: '6px', margin: 0 }}
                  />
                </div>
              )}
            </div>

            <div className="buttons">
              <button className="btn-start" onClick={startMonitor} disabled={isMonitoring}>
                ▶ Start Monitor
              </button>
              <button className="btn-stop" onClick={stopMonitor} disabled={!isMonitoring}>
                ⏹ Stop Monitor
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '20px' }}>
        <button className={activeTab === 'positions' ? 'tab active' : 'tab'} onClick={() => setActiveTab('positions')}>
          📋 Open Real Positions ({positions.length})
        </button>
        <button className={activeTab === 'history' ? 'tab active' : 'tab'} onClick={() => { setActiveTab('history'); fetchHistory(); }}>
          📜 Trade Book Executions ({history.length})
        </button>
      </div>

      {/* Open positions list */}
      {activeTab === 'positions' && (
        <div className="positions-card">
          {positions.length === 0 ? (
            <p className="no-positions">No open positions found in AngelOne</p>
          ) : (
            positions.map((pos, index) => (
              <div key={index} className="position-row">
                <div className="position-header">
                  <div className="position-info" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span className="symbol" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {pos.symbol}
                      <button
                        onClick={() => setActiveChart({
                          token: pos.symboltoken,
                          symbol: pos.symbol,
                          exchange: 'NFO'
                        })}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', fontSize: '14px' }}
                        title="View Live Chart"
                      >
                        📊
                      </button>
                    </span>
                    <span className="qty">Qty: {pos.quantity}</span>
                    <span className="buy-price">Avg Price: ₹{pos.buyPrice}</span>
                    <span className="current-price">LTP: ₹{pos.currentPrice}</span>
                    <span className={`pnl ${pos.pnl >= 0 ? 'profit' : 'loss'}`}>
                      P&L: ₹{pos.pnl.toFixed(2)}
                    </span>
                  </div>
                  <button className="btn-exit" onClick={() => closeRealPosition(pos)}>
                    Market Exit
                  </button>
                </div>

                <div className="position-settings" style={{ marginTop: '15px' }}>
                  <div className="input-group">
                    <label>🎯 Target (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. 5000"
                      value={positionSettings[pos.symbol]?.target || ''}
                      onChange={(e) => updatePositionSetting(pos.symbol, 'target', e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <label>🛑 Stop Loss (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. -2500"
                      value={positionSettings[pos.symbol]?.stopLoss || ''}
                      onChange={(e) => updatePositionSetting(pos.symbol, 'stopLoss', e.target.value)}
                    />
                  </div>
                  <div className="input-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                    <label style={{ cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={positionSettings[pos.symbol]?.useTrailingSL || false}
                        onChange={(e) => updatePositionSetting(pos.symbol, 'useTrailingSL', e.target.checked)}
                        style={{ marginRight: '4px' }}
                      />
                      Trail SL
                    </label>
                    {positionSettings[pos.symbol]?.useTrailingSL && (
                      <input
                        type="number"
                        placeholder="Step (₹)"
                        value={positionSettings[pos.symbol]?.trailAmount || ''}
                        onChange={(e) => updatePositionSetting(pos.symbol, 'trailAmount', e.target.value)}
                        style={{ width: '70px', padding: '3px', background: '#0f0f1a', border: '1px solid #2a2a3d', color: '#fff', borderRadius: '4px', fontSize: '11px', textAlign: 'center', margin: 0 }}
                      />
                    )}
                  </div>
                  <button className="btn-save" onClick={() => savePositionSettings(pos.symbol)}>
                    💾 Save
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* History Trade book */}
      {activeTab === 'history' && (
        <div className="positions-card">
          {history.length === 0 ? (
            <p className="no-positions">No executions found in AngelOne for today</p>
          ) : (
            history.map((trade, i) => (
              <div key={i} className="position-row" style={{ display: 'block' }}>
                <div className="position-info" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div>
                    <span className="symbol">{trade.symbol}</span>
                    <span className={`type-badge ${trade.side === 'BUY' ? 'ce' : 'sell'}`}>{trade.side}</span>
                    <span className="qty">Qty: {trade.quantity}</span>
                  </div>
                  <div>
                    <span className="buy-price">Executed Price: ₹{trade.buyPrice}</span>
                    <span className="current-price">Time: {new Date(trade.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
                {trade.exitSummary && (
                  <div className="exit-summary" style={{ marginTop: '10px', fontSize: '13px', color: '#aaa', fontStyle: 'italic' }}>
                    {trade.exitSummary}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
      {activeChart && (
        <StockChart
          token={activeChart.token}
          symbol={activeChart.symbol}
          exchange={activeChart.exchange}
          onClose={() => setActiveChart(null)}
        />
      )}
    </div>
  );
}

export default RealDashboard;
