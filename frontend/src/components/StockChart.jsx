import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import {
  ComposedChart,
  Area,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot
} from 'recharts';
import { API, SOCKET_URL } from '../config/api';

// Custom Candlestick shape for Recharts Bar component
const Candlestick = React.memo((props) => {
  const { x, y, width, height, payload } = props;
  if (!payload || typeof payload.open !== 'number' || typeof payload.close !== 'number') return null;
  const { open, close, high, low } = payload;
  const isBullish = close >= open;
  const color = isBullish ? '#22c55e' : '#ef4444';

  const bodyRange = Math.abs(open - close);
  if (bodyRange === 0) {
    const wickX = x + width / 2;
    return (
      <g>
        <line x1={wickX} y1={y - (high - open)} x2={wickX} y2={y + (open - low)} stroke={color} strokeWidth={1.5} />
        <line x1={x} y1={y} x2={x + width} y2={y} stroke={color} strokeWidth={2} />
      </g>
    );
  }

  const yRatio = height / bodyRange;
  const bodyTop = y;
  const bodyBottom = y + height;

  const highY = isBullish 
    ? bodyTop - (high - close) * yRatio
    : bodyTop - (high - open) * yRatio;
    
  const lowY = isBullish
    ? bodyBottom + (open - low) * yRatio
    : bodyBottom + (close - low) * yRatio;

  const bodyWidth = Math.max(width, 5);
  const wickX = x + bodyWidth / 2;

  return (
    <g>
      {/* Wick line */}
      <line 
        x1={wickX} 
        y1={highY} 
        x2={wickX} 
        y2={lowY} 
        stroke={color} 
        strokeWidth={1.5} 
      />
      {/* Body */}
      <rect
        x={x}
        y={y}
        width={bodyWidth}
        height={Math.max(height, 2)}
        fill={color}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
});

function StockChart({ token, symbol, exchange, onClose }) {
  const [candles, setCandles] = useState([]);
  const [interval, setIntervalVal] = useState('FIVE_MINUTE');
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState('candlestick');
  const [visibleCount, setVisibleCount] = useState(35);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  const chartContainerRef = useRef(null);
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);

  const candlesLengthRef = useRef(0);
  const visibleCountRef = useRef(35);
  const isHoveringChart = useRef(false);
  const wheelAccumulator = useRef(0);
  const animationFrameId = useRef(null);




  useEffect(() => {
    visibleCountRef.current = visibleCount;
  }, [visibleCount]);

  // Global window wheel and gesture listeners to block browser page zoom and zoom the chart instead
  useEffect(() => {
    const panAccumulator = { current: 0 };
    let wheelRafId = null;

    const handleGlobalWheel = (e) => {
      if (isHoveringChart.current) {
        e.preventDefault();
        
        // Determine intent: horizontal swipe vs vertical zoom
        const isHorizontalSwipe = Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey;
        
        if (isHorizontalSwipe) {
          panAccumulator.current += e.deltaX;
        } else {
          wheelAccumulator.current += e.deltaY;
        }
        
        // Throttle all state updates to screen refresh rate
        if (wheelRafId) return;
        wheelRafId = requestAnimationFrame(() => {
          wheelRafId = null;
          
          // Process horizontal pan
          const panThreshold = 50;
          if (Math.abs(panAccumulator.current) >= panThreshold) {
            const panStep = Math.max(1, Math.round(Math.abs(panAccumulator.current) / panThreshold));
            const direction = panAccumulator.current > 0 ? -panStep : panStep;
            setScrollOffset(prev => {
              const maxOff = Math.max(0, candlesLengthRef.current - visibleCountRef.current);
              return Math.max(0, Math.min(maxOff, prev + direction));
            });
            panAccumulator.current = 0;
          }
          
          // Process vertical zoom
          const zoomThreshold = e.ctrlKey ? 30 : 80;
          if (Math.abs(wheelAccumulator.current) >= zoomThreshold) {
            const isZoomIn = wheelAccumulator.current < 0;
            const zoomAmount = Math.max(1, Math.round(visibleCountRef.current * 0.08));
            const step = isZoomIn ? -zoomAmount : zoomAmount;
            
            setVisibleCount(prev => {
              const nextCount = prev + step;
              const validCount = Math.max(10, Math.min(candlesLengthRef.current, nextCount));
              return prev !== validCount ? validCount : prev;
            });
            
            wheelAccumulator.current = 0;
          }
        });
      }
    };

    const handleGlobalGesture = (e) => {
      if (isHoveringChart.current) {
        e.preventDefault();
      }
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    window.addEventListener('gesturestart', handleGlobalGesture, { passive: false });
    window.addEventListener('gesturechange', handleGlobalGesture, { passive: false });
    
    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
      window.removeEventListener('gesturestart', handleGlobalGesture);
      window.removeEventListener('gesturechange', handleGlobalGesture);
      if (wheelRafId) cancelAnimationFrame(wheelRafId);
    };
  }, []);

  // Keyboard Arrow Key Zoom and Pan controls for accessibility
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (candlesLengthRef.current === 0) return;
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVisibleCount(prev => Math.max(10, prev - 3));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVisibleCount(prev => Math.min(candlesLengthRef.current, prev + 3));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setScrollOffset(prev => Math.min(candlesLengthRef.current - visibleCountRef.current, prev + 3));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setScrollOffset(prev => Math.max(0, prev - 3));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMouseDown = (e) => {
    // Only drag with left mouse click
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartOffset.current = scrollOffset;
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    
    const clientX = e.clientX;
    
    // Throttle rendering updates to requestAnimationFrame (60 FPS) to eliminate drag lag
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    
    animationFrameId.current = requestAnimationFrame(() => {
      const deltaX = clientX - dragStartX.current;
      
      // Increased scale to 18px per candle for smoother mouse drag sensitivity
      const candleWidthPx = 18;
      const offsetDelta = Math.round(deltaX / candleWidthPx);
      
      const newOffset = Math.max(0, Math.min(candlesLengthRef.current - visibleCountRef.current, dragStartOffset.current + offsetDelta));
      
      setScrollOffset(prev => {
        if (prev !== newOffset) return newOffset;
        return prev;
      });
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
  };
  
  // Indicators
  const [showSMA9, setShowSMA9] = useState(false);
  const [showSMA21, setShowSMA21] = useState(false);
  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showEMA35, setShowEMA35] = useState(false);
  const [showEMA50, setShowEMA50] = useState(false);
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
        // Sort chronologically ascending to fix broken timeline
        const sorted = [...res.data.data].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
        
        // Detect if dataset spans across multiple days
        const uniqueDates = [...new Set(sorted.map(c => new Date(c[0]).toLocaleDateString()))];
        const isMultiDay = uniqueDates.length > 1;

        // Map AngelOne array format: [time, open, high, low, close, volume]
        const formatted = sorted.map(c => {
          const dt = new Date(c[0]);
          const open = Number(c[1]);
          const close = Number(c[4]);
          
          const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateLabel = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
          const standardDate = dt.toLocaleDateString();
          
          return {
            time: isMultiDay ? `${dateLabel} ${timeStr}` : timeStr,
            timeOnly: timeStr,
            date: standardDate,
            open,
            high: Number(c[2]),
            low: Number(c[3]),
            close,
            volume: Number(c[5]),
            openClose: [open, close],
            _timestamp: dt.getTime() // Keep raw timestamp for gap-fill
          };
        });

        // Gap-fill: insert flat candles for missing time slots (like Kite does for illiquid options)
        const intervalMinutes = {
          'ONE_MINUTE': 1,
          'FIVE_MINUTE': 5,
          'FIFTEEN_MINUTE': 15,
          'ONE_HOUR': 60
        };
        const gapMinutes = intervalMinutes[interval];
        
        let filled = formatted;
        if (gapMinutes && formatted.length > 1) {
          filled = [];
          const gapMs = gapMinutes * 60 * 1000;
          
          for (let i = 0; i < formatted.length; i++) {
            filled.push(formatted[i]);
            
            if (i < formatted.length - 1) {
              const currentTs = formatted[i]._timestamp;
              const nextTs = formatted[i + 1]._timestamp;
              const currentDate = formatted[i].date;
              const nextDate = formatted[i + 1].date;
              
              // Only fill gaps within the same trading day
              if (currentDate === nextDate) {
                let fillTs = currentTs + gapMs;
                const prevClose = formatted[i].close;
                
                while (fillTs < nextTs) {
                  const fillDt = new Date(fillTs);
                  const fillTimeStr = fillDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const fillDateLabel = fillDt.toLocaleDateString([], { month: 'short', day: 'numeric' });
                  const fillStandardDate = fillDt.toLocaleDateString();
                  
                  filled.push({
                    time: isMultiDay ? `${fillDateLabel} ${fillTimeStr}` : fillTimeStr,
                    timeOnly: fillTimeStr,
                    date: fillStandardDate,
                    open: prevClose,
                    high: prevClose,
                    low: prevClose,
                    close: prevClose,
                    volume: 0,
                    openClose: [prevClose, prevClose],
                    _timestamp: fillTs
                  });
                  fillTs += gapMs;
                }
              }
            }
          }
        }

        setCandles(filled);
        setVisibleCount(Math.min(50, filled.length));
        setScrollOffset(0);
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

  // Calculate technical indicators - Memoized to prevent heavy loop calculations on every scroll/drag frame
  const processedData = useMemo(() => {
    let data = [...candles];
    if (data.length === 0) return [];

    // Official NSE Trading Holidays 2026 (source: nseindia.com)
    const nseHolidays2026 = new Set([
      '2026-01-15', // Municipal Corporation Election
      '2026-01-26', // Republic Day
      '2026-03-03', // Holi
      '2026-03-26', // Shri Ram Navami
      '2026-03-31', // Shri Mahavir Jayanti
      '2026-04-03', // Good Friday
      '2026-04-14', // Dr. Ambedkar Jayanti
      '2026-05-01', // Maharashtra Day
      '2026-05-28', // Bakri Id
      '2026-06-26', // Muharram
      '2026-09-14', // Ganesh Chaturthi
      '2026-10-02', // Mahatma Gandhi Jayanti
      '2026-10-20', // Dussehra
      '2026-11-10', // Diwali Balipratipada
      '2026-11-24', // Guru Nanak Jayanti
      '2026-12-25', // Christmas
    ]);

    // Filter out weekends and official holidays
    data = data.filter(d => {
      const dt = new Date(d._timestamp || d.date);
      const day = dt.getDay();
      if (day === 0 || day === 6) return false; // Weekend
      
      // Check against holiday set (YYYY-MM-DD format)
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const isoDate = `${yyyy}-${mm}-${dd}`;
      if (nseHolidays2026.has(isoDate)) return false;
      
      return true;
    });
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

    // EMA 35 Calculation
    if (data.length >= 35) {
      const ema35Values = new Array(data.length).fill(null);
      let sum = 0;
      for (let i = 0; i < 35; i++) sum += data[i].close;
      ema35Values[34] = sum / 35;
      const multiplier = 2 / 36;
      for (let i = 35; i < data.length; i++) {
        ema35Values[i] = (data[i].close - ema35Values[i - 1]) * multiplier + ema35Values[i - 1];
      }
      data = data.map((d, idx) => ({
        ...d,
        ema35: ema35Values[idx] !== null ? Number(ema35Values[idx].toFixed(2)) : null
      }));
    } else {
      data = data.map(d => ({ ...d, ema35: null }));
    }

    // EMA 50 Calculation
    if (data.length >= 50) {
      const ema50Values = new Array(data.length).fill(null);
      let sum = 0;
      for (let i = 0; i < 50; i++) sum += data[i].close;
      ema50Values[49] = sum / 50;
      const multiplier = 2 / 51;
      for (let i = 50; i < data.length; i++) {
        ema50Values[i] = (data[i].close - ema50Values[i - 1]) * multiplier + ema50Values[i - 1];
      }
      data = data.map((d, idx) => ({
        ...d,
        ema50: ema50Values[idx] !== null ? Number(ema50Values[idx].toFixed(2)) : null
      }));
    } else {
      data = data.map(d => ({ ...d, ema50: null }));
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
  }, [candles, showSMA9, showSMA21, showEMA9, showEMA21, showEMA35, showEMA50, showRSI]);
  
  // Dynamic slice for Zoom & Pan
  const totalCandles = processedData.length;
  
  // Keep ref in sync with the actual displayed dataset length (used by wheel/drag handlers)
  candlesLengthRef.current = totalCandles;
  
  const currentVisibleCount = Math.min(visibleCount, totalCandles);
  const maxOffset = Math.max(0, totalCandles - currentVisibleCount);
  const currentOffset = Math.max(0, Math.min(maxOffset, scrollOffset));
  
  const endIndex = Math.min(totalCandles, totalCandles - currentOffset);
  const startIndex = Math.max(0, endIndex - currentVisibleCount);
  const visibleData = totalCandles > 0 ? processedData.slice(startIndex, endIndex) : [];

  const currentLTP = candles.length > 0 ? candles[candles.length - 1].close : '-';

  const modalStyle = isFullScreen ? {
    width: '100vw',
    height: '100vh',
    maxWidth: 'none',
    maxHeight: 'none',
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 1000,
    borderRadius: 0,
    padding: '24px',
    background: '#ffffff',
    color: '#1e293b',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column'
  } : {
    width: '95%',
    maxWidth: '1300px',
    padding: '24px',
    borderRadius: '16px',
    background: '#ffffff',
    color: '#1e293b',
    maxHeight: '90vh',
    overflowY: 'auto'
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}>
      <div className="modal" style={modalStyle}>
        
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              onClick={() => setIsFullScreen(!isFullScreen)} 
              title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
              style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
            >
              {isFullScreen ? '🗗' : '🖥️'}
            </button>
            <button 
              onClick={onClose} 
              style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Controls Panel */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '10px', marginBottom: '16px', alignItems: 'center' }}>
          
          {/* Chart Type Toggle */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setChartType('area')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: chartType === 'area' ? '#0ea5e9' : '#ffffff',
                color: chartType === 'area' ? '#ffffff' : '#475569',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              📈 Area
            </button>
            <button
              onClick={() => setChartType('candlestick')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: chartType === 'candlestick' ? '#10b981' : '#ffffff',
                color: chartType === 'candlestick' ? '#ffffff' : '#475569',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              🕯️ Candles
            </button>

          </div>

          <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />

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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
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
              onClick={() => setShowEMA35(!showEMA35)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: showEMA35 ? '#ffedd5' : '#ffffff',
                color: showEMA35 ? '#ea580c' : '#475569',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              EMA 35
            </button>
            <button
              onClick={() => setShowEMA50(!showEMA50)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: showEMA50 ? '#f3e8ff' : '#ffffff',
                color: showEMA50 ? '#7c3aed' : '#475569',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              EMA 50
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
        <div style={{ display: 'flex', gap: '20px', height: isFullScreen ? 'calc(100vh - 170px)' : '550px', flex: isFullScreen ? 1 : 'none' }}>
          
          {/* Chart Panel */}
          <div style={{ flex: 3, display: 'flex', flexDirection: 'column', height: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
            {loading ? (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                ⏳ Loading charts...
              </div>
            ) : visibleData.length === 0 ? (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                📭 No historical candle data available.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '10px' }}>
                
                {/* Main Area / Candlestick Chart */}
                <div 
                  ref={chartContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseEnter={() => { isHoveringChart.current = true; }}
                  onMouseLeave={() => { isHoveringChart.current = false; handleMouseUp(); }}
                  style={{ 
                    flex: showRSI ? 2.5 : 1, 
                    width: '100%', 
                    position: 'relative', 
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    outline: 'none'
                  }}
                >


                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={visibleData}>
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
                        minTickGap={50}
                      />
                      <YAxis 
                        domain={['auto', 'auto']} 
                        stroke="#94a3b8" 
                        fontSize={11} 
                        tickLine={false}
                        orientation="right"
                        tickFormatter={(v) => `₹${v.toFixed(0)}`}
                      />
                      {!isDragging && (
                        <Tooltip 
                          contentStyle={{ background: '#0f172a', borderRadius: '8px', border: 'none', color: '#ffffff', fontSize: '12px' }}
                          isAnimationActive={false}
                        />
                      )}
                      
                      {chartType === 'area' ? (
                        <Area 
                          type="monotone" 
                          dataKey="close" 
                          stroke="#0ea5e9" 
                          strokeWidth={2} 
                          fillOpacity={1} 
                          fill="url(#colorClose)" 
                          name="Price"
                          isAnimationActive={false}
                        />
                      ) : (
                        <Bar 
                          dataKey="openClose" 
                          name="Candle"
                          shape={<Candlestick />}
                          isAnimationActive={false}
                        />
                      )}

                      {showSMA9 && (
                        <Line 
                          type="monotone" 
                          dataKey="sma9" 
                          stroke="#0284c7" 
                          strokeWidth={1.5} 
                          dot={false}
                          name="SMA (9)"
                          isAnimationActive={false}
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
                          isAnimationActive={false}
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
                          isAnimationActive={false}
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
                          isAnimationActive={false}
                        />
                      )}
                      {showEMA35 && (
                        <Line 
                          type="monotone" 
                          dataKey="ema35" 
                          stroke="#ea580c" 
                          strokeWidth={2} 
                          dot={false}
                          name="EMA (35)"
                          isAnimationActive={false}
                        />
                      )}
                      {showEMA50 && (
                        <Line 
                          type="monotone" 
                          dataKey="ema50" 
                          stroke="#7c3aed" 
                          strokeWidth={2} 
                          dot={false}
                          name="EMA (50)"
                          isAnimationActive={false}
                        />
                      )}
                      
                      {/* Render crossover markers */}
                      {visibleData.map((d, idx) => {
                        const alert = triggeredAlerts.find(a => {
                          const alertTime = new Date(a.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          const alertDate = new Date(a.triggeredAt).toLocaleDateString();
                          return alertTime === d.timeOnly && alertDate === d.date;
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

                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* RSI Sub-Chart */}
                {showRSI && (
                  <div style={{ flex: 1, borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                    <h4 style={{ margin: '0 0 6px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>RSI (14)</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={visibleData}>
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
                        {!isDragging && (
                          <Tooltip contentStyle={{ background: '#0f172a', borderRadius: '8px', border: 'none', color: '#ffffff', fontSize: '11px' }} isAnimationActive={false} />
                        )}
                        <Line 
                          type="monotone" 
                          dataKey="rsi" 
                          stroke="#7c3aed" 
                          strokeWidth={1.5} 
                          dot={false}
                          name="RSI"
                          isAnimationActive={false}
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
