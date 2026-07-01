import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { io } from 'socket.io-client';
import StockChart from '../components/StockChart';

const API = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

function VirtualDashboard() {
  const [portfolio, setPortfolio] = useState(null);
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [activeTab, setActiveTab] = useState('positions');

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
      console.log('Virtual Dashboard Socket connected');
      if (positionsRef.current.length > 0) {
        const tokens = positionsRef.current.map(pos => pos.token).filter(Boolean);
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
          if (pos.token === data.token) {
            const currentPrice = data.ltp;
            const pnl = pos.side === 'SELL'
              ? (pos.buyPrice - currentPrice) * pos.quantity
              : (currentPrice - pos.buyPrice) * pos.quantity;
            return { ...pos, currentPrice, pnl };
          }
          return pos;
        });
        positionsRef.current = updated;
        return updated;
      });
    });

    socket.on('monitor-update', (data) => {
      if (data && data.mode === 'virtual') {
        setIsMonitoring(data.isMonitoring);
        setRunningSettings(data.settings);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    fetchPortfolio();
    fetchPositions();
    fetchHistory();
    checkMonitorStatus();

    const interval = setInterval(() => {
      fetchPortfolio();
      fetchPositions();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const fetchPortfolio = async () => {
    try {
      const res = await axios.get(`${API}/virtual/portfolio`, { headers });
      if (res.data.success) setPortfolio(res.data.data);
    } catch (error) {
      console.log('Error fetching portfolio:', error);
    }
  };

  const fetchPositions = async () => {
    try {
      const res = await axios.get(`${API}/virtual/positions`, { headers });
      if (res.data.success) {
        setPositions(res.data.data);
        positionsRef.current = res.data.data;

        // Sub tokens
        const tokens = res.data.data.map(pos => pos.token).filter(Boolean);
        if (tokens.length > 0 && socketRef.current?.connected) {
          socketRef.current.emit('subscribe-tokens', { tokens });
        }
      }
    } catch (error) {
      console.log('Error fetching positions:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/virtual/history`, { headers });
      if (res.data.success) setHistory(res.data.data);
    } catch (error) {
      console.log('Error fetching history:', error);
    }
  };

  const checkMonitorStatus = async () => {
    try {
      const res = await axios.get(`${API}/monitor/status?mode=virtual`, { headers });
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
        mode: 'virtual'
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
      const res = await axios.post(`${API}/monitor/stop`, { mode: 'virtual' }, { headers });
      if (res.data.success) {
        setIsMonitoring(false);
        setRunningSettings(null);
        toast.success(res.data.message);
      }
    } catch (error) {
      toast.error('Error stopping monitor!');
    }
  };

  const closeTrade = async (tradeId, currentPrice) => {
    try {
      const res = await axios.post(`${API}/virtual/close`, {
        tradeId,
        sellPrice: currentPrice,
        exitReason: 'MANUAL'
      }, { headers });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchPortfolio();
        fetchPositions();
        fetchHistory();
      }
    } catch (error) {
      toast.error('Error closing trade!');
    }
  };

  const resetPortfolio = async () => {
    if (!window.confirm('Reset portfolio? All trades will be closed!')) return;
    try {
      const res = await axios.post(`${API}/virtual/reset`, {}, { headers });
      if (res.data.success) {
        toast.success('Portfolio reset!');
        fetchPortfolio();
        fetchPositions();
        fetchHistory();
      }
    } catch (error) {
      toast.error('Error resetting portfolio!');
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
        mode: 'virtual'
      }, { headers });
      if (res.data.success) toast.success(`Settings saved for ${symbol}!`);
    } catch (error) {
      toast.error('Error saving position settings!');
    }
  };

  const winRate = portfolio?.totalTrades > 0
    ? ((portfolio.winningTrades / portfolio.totalTrades) * 100).toFixed(1)
    : 0;

  const totalPnL = positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);

  return (
    <div className="app">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="header">
        <div>
          <h1>🎮 Virtual Trading Dashboard</h1>
          <p className="subtitle">Practice and test paper strategies safely</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div className={`status ${isMonitoring ? 'active' : 'inactive'}`}>
              {isMonitoring ? '🟢 Virtual Monitor Active' : '🔴 Virtual Monitor Inactive'}
            </div>
            {isMonitoring && runningSettings && (
              <div style={{ fontSize: '11px', color: '#475569', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '4px 10px', borderRadius: '6px', textAlign: 'right' }}>
                Target: <strong style={{ color: '#047857' }}>₹{Number(runningSettings.targetProfit || 0).toLocaleString()}</strong> | SL: <strong style={{ color: '#b91c1c' }}>₹{Number(runningSettings.dynamicStopLoss != null ? runningSettings.dynamicStopLoss : runningSettings.stopLoss || 0).toLocaleString()}</strong>
                {runningSettings.useTrailingSL && (
                  <span> | Trail Step: <strong style={{ color: '#0284c7' }}>₹{Number(runningSettings.trailAmount || 0).toLocaleString()}</strong></span>
                )}
                {runningSettings.useTrailingSL && runningSettings.maxPnL > 0 && (
                  <span> | Peak P&L: <strong style={{ color: '#047857' }}>₹{Number(runningSettings.maxPnL || 0).toLocaleString()}</strong></span>
                )}
              </div>
            )}
          </div>
          <button className="btn-reset" onClick={resetPortfolio}>🔄 Reset Portfolio</button>
        </div>
      </div>

      {portfolio && (
        <div className="stats-grid">
          <div className="stat-card">
            <p>💰 Current Balance</p>
            <h2>₹{portfolio.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</h2>
          </div>
          <div className="stat-card">
            <p>📊 Total P&L</p>
            <h2 className={portfolio.totalPnL >= 0 ? 'profit' : 'loss'}>
              ₹{portfolio.totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </h2>
          </div>
          <div className="stat-card">
            <p>📈 Live Positions P&L</p>
            <h2 className={totalPnL >= 0 ? 'profit' : 'loss'}>
              ₹{totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </h2>
          </div>
          <div className="stat-card">
            <p>🎯 Win Rate</p>
            <h2>{winRate}%</h2>
          </div>
          <div className="stat-card">
            <p>📋 Total Trades</p>
            <h2>{portfolio.totalTrades}</h2>
          </div>
          <div className="stat-card">
            <p>✅ Winning</p>
            <h2 className="profit">{portfolio.winningTrades}</h2>
          </div>
          <div className="stat-card">
            <p>❌ Losing</p>
            <h2 className="loss">{portfolio.losingTrades}</h2>
          </div>
          <div className="stat-card">
            <p>💎 Initial Capital</p>
            <h2>₹{portfolio.initialBalance.toLocaleString('en-IN')}</h2>
          </div>
        </div>
      )}

      {/* Global Settings */}
      <div className="settings-card">
        <h2>⚙️ Global P&L Monitor Settings (Virtual)</h2>
        <p className="subtitle">Automatically exit all virtual positions when total P&L hits these limits</p>
        <div className="settings-grid">
          <div className="input-group">
            <label>🎯 Target Profit (₹)</label>
            <input
              type="number"
              placeholder="e.g. 10000"
              value={globalSettings.targetProfit}
              onChange={(e) => setGlobalSettings({...globalSettings, targetProfit: e.target.value})}
            />
          </div>
          <div className="input-group">
            <label>🛑 Stop Loss (₹)</label>
            <input
              type="number"
              placeholder="e.g. -7000"
              value={globalSettings.stopLoss}
              onChange={(e) => setGlobalSettings({...globalSettings, stopLoss: e.target.value})}
            />
          </div>
          <div className="input-group">
            <label>📈 Partial Profit At (₹)</label>
            <input
              type="number"
              placeholder="e.g. 5000"
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

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '20px' }}>
        <button className={activeTab === 'positions' ? 'tab active' : 'tab'} onClick={() => setActiveTab('positions')}>
          📋 Open Virtual Positions ({positions.length})
        </button>
        <button className={activeTab === 'history' ? 'tab active' : 'tab'} onClick={() => setActiveTab('history')}>
          📜 Virtual Trade History ({history.length})
        </button>
      </div>

      {/* Positions list */}
      {activeTab === 'positions' && (
        <div className="positions-card">
          {positions.length === 0 ? (
            <p className="no-positions">No open virtual positions found</p>
          ) : (
            positions.map((pos) => (
              <div key={pos._id} className="position-row">
                <div className="position-header">
                  <div className="position-info" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span className="symbol" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {pos.symbol}
                      <button
                        onClick={() => setActiveChart({
                          token: pos.token,
                          symbol: pos.symbol,
                          exchange: 'NFO'
                        })}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', fontSize: '14px' }}
                        title="View Live Chart"
                      >
                        📊
                      </button>
                    </span>
                    <span className={`type-badge ${pos.type === 'CE' ? 'ce' : 'pe'}`}>{pos.type}</span>
                    <span className={`type-badge ${pos.side === 'BUY' ? 'ce' : 'sell'}`}>{pos.side || 'BUY'}</span>
                    <span className="qty">Qty: {pos.quantity}</span>
                    <span className="buy-price">{pos.side === 'SELL' ? 'Sell' : 'Buy'}: ₹{pos.buyPrice}</span>
                    <span className="current-price">LTP: ₹{pos.currentPrice}</span>
                    <span className={`pnl ${pos.pnl >= 0 ? 'profit' : 'loss'}`}>
                      P&L: ₹{pos.pnl.toFixed(2)}
                    </span>
                  </div>
                  <button className="btn-exit" onClick={() => closeTrade(pos._id, pos.currentPrice)}>
                    Exit
                  </button>
                </div>
                
                <div className="position-settings" style={{ marginTop: '15px' }}>
                  <div className="input-group">
                    <label>🎯 Target (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. 3000"
                      value={positionSettings[pos.symbol]?.target || ''}
                      onChange={(e) => updatePositionSetting(pos.symbol, 'target', e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <label>🛑 Stop Loss (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. -1500"
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

      {/* History tab */}
      {activeTab === 'history' && (
        <div className="positions-card">
          {history.length === 0 ? (
            <p className="no-positions">No closed trades yet</p>
          ) : (
            history.map((trade) => (
              <div key={trade._id} className="position-row" style={{ display: 'block' }}>
                <div className="position-info" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div>
                    <span className="symbol">{trade.symbol}</span>
                    <span className={`type-badge ${trade.type === 'CE' ? 'ce' : 'pe'}`}>{trade.type}</span>
                    <span className={`type-badge ${trade.side === 'BUY' ? 'ce' : 'sell'}`}>{trade.side || 'BUY'}</span>
                    <span className="qty">Qty: {trade.quantity}</span>
                  </div>
                  <div>
                    <span className="buy-price">{trade.side === 'SELL' ? 'Sell' : 'Buy'}: ₹{trade.buyPrice}</span>
                    <span className="current-price">Exit: ₹{trade.sellPrice}</span>
                    <span className={`pnl ${trade.pnl >= 0 ? 'profit' : 'loss'}`}>
                      P&L: ₹{trade.pnl.toFixed(2)}
                    </span>
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

export default VirtualDashboard;
