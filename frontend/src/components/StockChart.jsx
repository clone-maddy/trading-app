import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot
} from 'recharts';

const API = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

function StockChart({ token, symbol, exchange, onClose }) {
  const [candles, setCandles] = useState([]);
  const [interval, setIntervalVal] = useState('FIVE_MINUTE');
  const [loading, setLoading] = useState(false);
  
  // Indicators
  const [showSMA9, setShowSMA9] = useState(false);
  const [showSMA21, setShowSMA21] = useState(false);
  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showRSI, setShowRSI] = useState(false);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);

  // Alerts
  const [alerts, setAlerts] = useState([]);
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertCondition, setAlertCondition] = useState('ABOVE'); // ABOVE or BELOW

  const socketRef = useRef(null);
  const candlesRef = useRef([]);

  // Sync ref with state for socket callback access
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  // Request Notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Fetch candles
  const fetchCandleData = async () => {
    setLoading(true);
    try {
      const userToken = localStorage.getItem('token');
      const res = await axios.get(
        `${API}/options/candles?token=${token}&exchange=${exchange}&interval=${interval}`,
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
      if (res.data.success && Array.isArray(res.data.data)) {
        // Map AngelOne array format: [time, open, high, low, close, volume]
        const formatted = res.data.data.map(c => ({
          time: new Date(c[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: new Date(c[0]).toLocaleDateString(),
          open: Number(c[1]),
          high: Number(c[2]),
          low: Number(c[3]),
          close: Number(c[4]),
          volume: Number(c[5])
        }));
        setCandles(formatted);
      }
    } catch (error) {
      toast.error('Failed to load chart data!');
    }
    setLoading(false);
  };

  const fetchTokenAlerts = async () => {
    try {
      const userToken = localStorage.getItem('token');
      const res = await axios.get(`${API}/alerts`, { headers: { Authorization: `Bearer ${userToken}` } });
      if (res.data.success) {
        const filtered = res.data.data.filter(a => a.token === token && a.type === 'ema_crossover');
        setTriggeredAlerts(filtered);
      }
    } catch (err) {
      console.log('Failed to fetch token alerts:', err);
    }
  };

  useEffect(() => {
    fetchCandleData();
    fetchTokenAlerts();
  }, [token, interval]);

  // Connect Socket for Live LTP Updates on Chart
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('subscribe-tokens', { tokens: [token] });
    });

    socket.on('price-update', (data) => {
      if (data && data.token === token && data.ltp) {
        const liveLTP = Number(data.ltp);
        
        // Update the last candle or append a new live tick
        setCandles(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const lastCandle = { ...updated[updated.length - 1] };
          
          // Smooth real-time update: mutate last candle close/high/low
          lastCandle.close = liveLTP;
          if (liveLTP > lastCandle.high) lastCandle.high = liveLTP;
          if (liveLTP < lastCandle.low) lastCandle.low = liveLTP;
          updated[updated.length - 1] = lastCandle;
          return updated;
        });

        // Evaluate local alerts
        checkPriceAlerts(liveLTP);
      }
    });

    return () => {
      socket.emit('unsubscribe-tokens', { tokens: [token] });
      socket.disconnect();
    };
  }, [token]);

  // Alert evaluation logic
  const checkPriceAlerts = (currentPrice) => {
    setAlerts(prev => {
      const activeAlerts = [];
      const triggeredAlerts = [];

      prev.forEach(alert => {
        let isTriggered = false;
        if (alert.condition === 'ABOVE' && currentPrice >= alert.price) {
          isTriggered = true;
        } else if (alert.condition === 'BELOW' && currentPrice <= alert.price) {
          isTriggered = true;
        }

        if (isTriggered) {
          triggeredAlerts.push(alert);
        } else {
          activeAlerts.push(alert);
        }
      });

      if (triggeredAlerts.length > 0) {
        triggeredAlerts.forEach(alert => {
          const msg = `🚨 Price Alert: ${symbol} is now ₹${currentPrice} (${alert.condition} ${alert.price})`;
          toast.success(msg, { duration: 8000 });
          
          // Browser Push Notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('📈 Trading Assistant Price Alert', {
              body: msg,
              icon: 'https://cdn-icons-png.flaticon.com/512/3594/3594417.png'
            });
          }
        });
      }

      return activeAlerts;
    });
  };

  // Add a new price alert
  const addAlert = () => {
    const price = Number(alertTargetPrice);
    if (isNaN(price) || price <= 0) {
      toast.error('Please enter a valid price!');
      return;
    }
    const newAlert = {
      id: Date.now(),
      price,
      condition: alertCondition
    };
    setAlerts(prev => [...prev, newAlert]);
    setAlertTargetPrice('');
    toast.success(`Alert set for ${symbol} when price crosses ${alertCondition} ₹${price}`);
  };

  const removeAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  // Calculate technical indicators
  const getProcessedData = () => {
    let data = [...candles];
    if (data.length === 0) return [];

    // SMA 9 Calculation
    if (showSMA9) {
      data = data.map((d, idx) => {
        if (idx < 8) return { ...d, sma9: null };
        let sum = 0;
        for (let i = 0; i < 9; i++) sum += data[idx - i].close;
        return { ...d, sma9: Number((sum / 9).toFixed(2)) };
      });
    }

    // SMA 21 Calculation
    if (showSMA21) {
      data = data.map((d, idx) => {
        if (idx < 20) return { ...d, sma21: null };
        let sum = 0;
        for (let i = 0; i < 21; i++) sum += data[idx - i].close;
        return { ...d, sma21: Number((sum / 21).toFixed(2)) };
      });
    }

    // EMA 9 Calculation
    if (data.length >= 9) {
      const ema9Values = new Array(data.length).fill(null);
      let sum = 0;
      for (let i = 0; i < 9; i++) sum += data[i].close;
      ema9Values[8] = sum / 9;
      const multiplier = 2 / 10;
      for (let i = 9; i < data.length; i++) {
        ema9Values[i] = (data[i].close - ema9Values[i - 1]) * multiplier + ema9Values[i - 1];
      }
      data = data.map((d, idx) => ({
        ...d,
        ema9: ema9Values[idx] !== null ? Number(ema9Values[idx].toFixed(2)) : null
      }));
    } else {
      data = data.map(d => ({ ...d, ema9: null }));
    }

    // EMA 21 Calculation
    if (data.length >= 21) {
      const ema21Values = new Array(data.length).fill(null);
      let sum = 0;
      for (let i = 0; i < 21; i++) sum += data[i].close;
      ema21Values[20] = sum / 21;
      const multiplier = 2 / 22;
      for (let i = 21; i < data.length; i++) {
        ema21Values[i] = (data[i].close - ema21Values[i - 1]) * multiplier + ema21Values[i - 1];
      }
      data = data.map((d, idx) => ({
        ...d,
        ema21: ema21Values[idx] !== null ? Number(ema21Values[idx].toFixed(2)) : null
      }));
    } else {
      data = data.map(d => ({ ...d, ema21: null }));
    }

    // RSI 14 Calculation
    if (showRSI && data.length > 15) {
      let gains = 0;
      let losses = 0;

      for (let i = 1; i <= 14; i++) {
        const diff = data[i].close - data[i - 1].close;
        if (diff > 0) gains += diff;
        else losses -= diff;
      }

      let avgGain = gains / 14;
      let avgLoss = losses / 14;

      data[0].rsi = null;
      for (let i = 1; i < data.length; i++) {
        if (i < 14) {
          data[i].rsi = null;
          continue;
        }
        if (i > 14) {
          const diff = data[i].close - data[i - 1].close;
          avgGain = (avgGain * 13 + (diff > 0 ? diff : 0)) / 14;
          avgLoss = (avgLoss * 13 + (diff < 0 ? -diff : 0)) / 14;
        }
        const rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
        data[i].rsi = avgLoss === 0 ? 100 : Number((100 - 100 / (1 + rs)).toFixed(2));
      }
    }

    return data;
  };

  const processedData = getProcessedData();
  const currentLTP = candles.length > 0 ? candles[candles.length - 1].close : '-';

  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}>
      <div className="modal" style={{ width: '90%', maxWidth: '1000px', padding: '24px', borderRadius: '16px', background: '#ffffff', color: '#1e293b' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>
              📊 Chart: {symbol}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Exchange: <span style={{ fontWeight: '600' }}>{exchange}</span> | Live LTP: <strong style={{ color: '#047857', fontSize: '15px' }}>₹{currentLTP}</strong>
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}
          >
            ✕
          </button>
        </div>

        {/* Controls Panel */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '10px', marginBottom: '16px', alignItems: 'center' }}>
          
          {/* Timeframe selector */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {['ONE_MINUTE', 'FIVE_MINUTE', 'FIFTEEN_MINUTE', 'ONE_HOUR', 'ONE_DAY'].map(timeframe => {
              const label = timeframe === 'ONE_MINUTE' ? '1m'
                          : timeframe === 'FIVE_MINUTE' ? '5m'
                          : timeframe === 'FIFTEEN_MINUTE' ? '15m'
                          : timeframe === 'ONE_HOUR' ? '1h'
                          : '1d';
              const active = interval === timeframe;
              return (
                <button
                  key={timeframe}
                  onClick={() => setIntervalVal(timeframe)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: active ? '#0f172a' : '#ffffff',
                    color: active ? '#ffffff' : '#475569',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />

          {/* Indicator toggles */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setShowSMA9(!showSMA9)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: showSMA9 ? '#e0f2fe' : '#ffffff',
                color: showSMA9 ? '#0369a1' : '#475569',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              SMA 9
            </button>
            <button
              onClick={() => setShowSMA21(!showSMA21)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: showSMA21 ? '#fdf2f8' : '#ffffff',
                color: showSMA21 ? '#be185d' : '#475569',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              SMA 21
            </button>
            <button
              onClick={() => setShowEMA9(!showEMA9)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: showEMA9 ? '#dcfce7' : '#ffffff',
                color: showEMA9 ? '#15803d' : '#475569',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              EMA 9
            </button>
            <button
              onClick={() => setShowEMA21(!showEMA21)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: showEMA21 ? '#fee2e2' : '#ffffff',
                color: showEMA21 ? '#b91c1c' : '#475569',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              EMA 21
            </button>
            <button
              onClick={() => setShowRSI(!showRSI)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: showRSI ? '#f5f3ff' : '#ffffff',
                color: showRSI ? '#6d28d9' : '#475569',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              RSI (14)
            </button>
          </div>
        </div>

        {/* Content Layout: Chart (Left) + Alerts Manager (Right) */}
        <div style={{ display: 'flex', gap: '20px', height: '400px' }}>
          
          {/* Chart Panel */}
          <div style={{ flex: 3, display: 'flex', flexDirection: 'column', height: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
            {loading ? (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                ⏳ Loading charts...
              </div>
            ) : processedData.length === 0 ? (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                📭 No historical candle data available.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '10px' }}>
                
                {/* Main Area Chart */}
                <div style={{ flex: showRSI ? 2.5 : 1, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={processedData}>
                      <defs>
                        <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="time" 
                        stroke="#94a3b8" 
                        fontSize={11} 
                        tickLine={false} 
                      />
                      <YAxis 
                        domain={['auto', 'auto']} 
                        stroke="#94a3b8" 
                        fontSize={11} 
                        tickLine={false}
                        orientation="right"
                        tickFormatter={(v) => `₹${v.toFixed(0)}`}
                      />
                      <Tooltip 
                        contentStyle={{ background: '#0f172a', borderRadius: '8px', border: 'none', color: '#ffffff', fontSize: '12px' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="close" 
                        stroke="#0ea5e9" 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill="url(#colorClose)" 
                        name="Price"
                      />
                      {showSMA9 && (
                        <Line 
                          type="monotone" 
                          dataKey="sma9" 
                          stroke="#0284c7" 
                          strokeWidth={1.5} 
                          dot={false}
                          name="SMA (9)"
                        />
                      )}
                      {showSMA21 && (
                        <Line 
                          type="monotone" 
                          dataKey="sma21" 
                          stroke="#db2777" 
                          strokeWidth={1.5} 
                          dot={false}
                          name="SMA (21)"
                        />
                      )}
                      {showEMA9 && (
                        <Line 
                          type="monotone" 
                          dataKey="ema9" 
                          stroke="#22c55e" 
                          strokeWidth={2} 
                          dot={false}
                          name="EMA (9)"
                        />
                      )}
                      {showEMA21 && (
                        <Line 
                          type="monotone" 
                          dataKey="ema21" 
                          stroke="#ef4444" 
                          strokeWidth={2} 
                          dot={false}
                          name="EMA (21)"
                        />
                      )}
                      
                      {/* Render crossover markers */}
                      {processedData.map((d, idx) => {
                        const alert = triggeredAlerts.find(a => {
                          const alertTime = new Date(a.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          const alertDate = new Date(a.triggeredAt).toLocaleDateString();
                          return alertTime === d.time && alertDate === d.date;
                        });

                        if (alert && d.ema9 !== null) {
                          const isBullish = alert.direction === 'bullish';
                          return (
                            <ReferenceDot
                              key={`refdot-${idx}`}
                              x={d.time}
                              y={d.ema9}
                              r={6}
                              fill={isBullish ? '#22c55e' : '#ef4444'}
                              stroke="#ffffff"
                              strokeWidth={2}
                              label={{
                                value: isBullish ? '▲' : '▼',
                                position: 'top',
                                fill: isBullish ? '#22c55e' : '#ef4444',
                                fontSize: 14,
                                fontWeight: 'bold'
                              }}
                            />
                          );
                        }
                        return null;
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* RSI Sub-Chart */}
                {showRSI && (
                  <div style={{ flex: 1, borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                    <h4 style={{ margin: '0 0 6px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>RSI (14)</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={processedData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="time" hide />
                        <YAxis 
                          domain={[0, 100]} 
                          ticks={[30, 70]} 
                          stroke="#94a3b8" 
                          fontSize={10} 
                          orientation="right" 
                          tickLine={false}
                        />
                        <Tooltip contentStyle={{ background: '#0f172a', borderRadius: '8px', border: 'none', color: '#ffffff', fontSize: '11px' }} />
                        <Line 
                          type="monotone" 
                          dataKey="rsi" 
                          stroke="#7c3aed" 
                          strokeWidth={1.5} 
                          dot={false}
                          name="RSI"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

              </div>
            )}
          </div>

          {/* Live Alerts Manager (Right Sidebar) */}
          <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
              🚨 Price Alerts
            </h3>
            
            {/* Alert Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  value={alertCondition}
                  onChange={(e) => setAlertCondition(e.target.value)}
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    background: '#ffffff',
                    fontWeight: '600'
                  }}
                >
                  <option value="ABOVE">≥</option>
                  <option value="BELOW">≤</option>
                </select>
                <input
                  type="number"
                  placeholder="Target price (₹)"
                  value={alertTargetPrice}
                  onChange={(e) => setAlertTargetPrice(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    background: '#ffffff'
                  }}
                />
              </div>
              <button
                onClick={addAlert}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#0ea5e9',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Set Alert
              </button>
            </div>

            {/* Alerts List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', display: 'block' }}>
                Active Alerts ({alerts.length})
              </span>
              {alerts.length === 0 ? (
                <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                  No active alerts.
                </p>
              ) : (
                alerts.map(a => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px',
                      background: '#ffffff',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px'
                    }}
                  >
                    <span>
                      Crosses <strong style={{ color: a.condition === 'ABOVE' ? '#b91c1c' : '#047857' }}>{a.condition}</strong> <strong>₹{a.price}</strong>
                    </span>
                    <button
                      onClick={() => removeAlert(a.id)}
                      style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}

export default StockChart;
