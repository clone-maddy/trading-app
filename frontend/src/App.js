import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';

const API = 'http://localhost:5000/api';

function App() {
  const [positions, setPositions] = useState([]);
  const [totalPnL, setTotalPnL] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [globalSettings, setGlobalSettings] = useState({
    targetProfit: '',
    stopLoss: '',
    partialProfitAt: '',
    partialProfitPercent: '50'
  });
  const [positionSettings, setPositionSettings] = useState({});

  useEffect(() => {
    fetchPositions();
    checkMonitorStatus();
    const interval = setInterval(() => {
      fetchPositions();
      checkMonitorStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchPositions = async () => {
    try {
      const res = await axios.get(`${API}/positions`);
      if (res.data.success) {
        setPositions(res.data.data);
        const total = res.data.data.reduce((sum, pos) => sum + pos.pnl, 0);
        setTotalPnL(total);
      }
    } catch (error) {
      console.log('Error fetching positions:', error);
    }
  };

  const checkMonitorStatus = async () => {
    try {
      const res = await axios.get(`${API}/monitor/status`);
      setIsMonitoring(res.data.isMonitoring);
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
      const res = await axios.post(`${API}/monitor/start`, {
        targetProfit: Number(globalSettings.targetProfit),
        stopLoss: Number(globalSettings.stopLoss),
        partialProfitAt: Number(globalSettings.partialProfitAt),
        partialProfitPercent: Number(globalSettings.partialProfitPercent)
      });
      if (res.data.success) {
        setIsMonitoring(true);
        toast.success('Monitor started!');
      }
    } catch (error) {
      toast.error('Error starting monitor!');
    }
  };

  const stopMonitor = async () => {
    try {
      const res = await axios.post(`${API}/monitor/stop`);
      if (res.data.success) {
        setIsMonitoring(false);
        toast.success('Monitor stopped!');
      }
    } catch (error) {
      toast.error('Error stopping monitor!');
    }
  };

  const updatePositionSetting = (symbol, field, value) => {
    setPositionSettings(prev => ({
      ...prev,
      [symbol]: {
        ...prev[symbol],
        [field]: value
      }
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
        stopLoss: Number(settings.stopLoss)
      });
      if (res.data.success) {
        toast.success(`Settings saved for ${symbol}!`);
      }
    } catch (error) {
      toast.error('Error saving position settings!');
    }
  };

  return (
    <div className="app">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="header">
        <h1>📈 Trading Assistant</h1>
        <div className={`status ${isMonitoring ? 'active' : 'inactive'}`}>
          {isMonitoring ? '🟢 Monitoring Active' : '🔴 Monitoring Inactive'}
        </div>
      </div>

      {/* Total PnL Card */}
      <div className={`pnl-card ${totalPnL >= 0 ? 'profit' : 'loss'}`}>
        <h2>Total P&L</h2>
        <h1>₹{totalPnL.toFixed(2)}</h1>
      </div>

      {/* Global Settings */}
      <div className="settings-card">
        <h2>⚙️ Global Monitor Settings</h2>
        <p className="subtitle">Exit ALL positions when total P&L hits these levels</p>
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
              placeholder="e.g. 6000"
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
        <div className="buttons">
          <button
            className="btn-start"
            onClick={startMonitor}
            disabled={isMonitoring}
          >
            ▶ Start Monitor
          </button>
          <button
            className="btn-stop"
            onClick={stopMonitor}
            disabled={!isMonitoring}
          >
            ⏹ Stop Monitor
          </button>
        </div>
      </div>

      {/* Positions Table */}
      <div className="positions-card">
        <h2>📋 Open Positions</h2>
        {positions.length === 0 ? (
          <p className="no-positions">No open positions found</p>
        ) : (
          positions.map((pos, index) => (
            <div key={index} className="position-row">
              <div className="position-header">
                <div className="position-info">
                  <span className="symbol">{pos.symbol}</span>
                  <span className="qty">Qty: {pos.quantity}</span>
                  <span className="buy-price">Buy: ₹{pos.buyPrice}</span>
                  <span className="current-price">LTP: ₹{pos.currentPrice}</span>
                  <span className={`pnl ${pos.pnl >= 0 ? 'profit' : 'loss'}`}>
                    P&L: ₹{pos.pnl}
                  </span>
                </div>
              </div>
              <div className="position-settings">
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
                <button
                  className="btn-save"
                  onClick={() => savePositionSettings(pos.symbol)}
                >
                  💾 Save
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;