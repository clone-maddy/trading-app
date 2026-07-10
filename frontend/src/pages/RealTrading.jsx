import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { io } from 'socket.io-client';
import StockChart from '../components/StockChart';
import { API, SOCKET_URL } from '../config/api';

const INDEX_TOKENS = {
  'NIFTY': '99926000',
  'BANKNIFTY': '99926009',
  'FINNIFTY': '99926037'
};

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

function RealTrading() {
  const [selectedIndex, setSelectedIndex] = useState('NIFTY');
  const [expiries, setExpiries] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [optionChain, setOptionChain] = useState([]);
  const [spotPrice, setSpotPrice] = useState(0);
  const [activeChart, setActiveChart] = useState(null);
  const [loadingChain, setLoadingChain] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [multiOiSummary, setMultiOiSummary] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [tradeModal, setTradeModal] = useState(null);
  const [quantity, setQuantity] = useState(1);

  const socketRef = useRef(null);
  const subscribedTokensRef = useRef([]);
  const [flashingCells, setFlashingCells] = useState(new Set());
  const atmRef = useRef(null);
  const hasScrolledRef = useRef(false);

  const selectedIndexRef = useRef(selectedIndex);
  const optionChainRef = useRef(optionChain);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    optionChainRef.current = optionChain;
  }, [optionChain]);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Reset scroll flag when changing parameters
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [selectedIndex, selectedExpiry]);

  // Scroll to ATM strike only on initial load
  useEffect(() => {
    if (optionChain.length > 0 && atmRef.current && !hasScrolledRef.current) {
      hasScrolledRef.current = true;
      setTimeout(() => {
        if (atmRef.current) {
          atmRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 400);
    }
  }, [optionChain]);

  // Connect Socket.IO on mount
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsLive(true);
      socket.emit('register-user', { token });
      if (optionChainRef.current.length > 0) {
        const newTokens = [];
        optionChainRef.current.forEach(row => {
          if (row.ce?.token) newTokens.push(row.ce.token);
          if (row.pe?.token) newTokens.push(row.pe.token);
        });
        const indexToken = INDEX_TOKENS[selectedIndexRef.current];
        if (indexToken) {
          newTokens.push(indexToken);
        }
        subscribedTokensRef.current = newTokens;
        socket.emit('subscribe-tokens', { tokens: newTokens });
      }
    });

    socket.on('disconnect', () => {
      setIsLive(false);
    });

    // Listen for price updates
    socket.on('price-update', (data) => {
      if (!data || !data.token || !data.ltp) return;

      // Handle index spot price ticks
      if (data.token === INDEX_TOKENS[selectedIndexRef.current]) {
        setSpotPrice(data.ltp);
        return;
      }

      let type = '';
      setOptionChain(prev => {
        return prev.map(row => {
          const newRow = { ...row };
          if (row.ce && row.ce.token === data.token) {
            newRow.ce = { ...row.ce, ...data };
            type = 'ce';
          }
          if (row.pe && row.pe.token === data.token) {
            newRow.pe = { ...row.pe, ...data };
            type = 'pe';
          }
          return newRow;
        });
      });

      if (type) {
        const cellId = `${type}-${data.token}`;
        setFlashingCells(prev => {
          const next = new Set(prev);
          next.add(cellId);
          return next;
        });
        setTimeout(() => {
          setFlashingCells(prev => {
            const next = new Set(prev);
            next.delete(cellId);
            return next;
          });
        }, 500);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchMultiOiSummary = async (indexName) => {
    setLoadingSummary(true);
    try {
      const res = await axios.get(`${API}/options/oi-summary/${indexName}`, { headers });
      if (res.data.success) {
        setMultiOiSummary(res.data.data || []);
      }
    } catch (err) {
      console.log('Error fetching multi-expiry summary:', err.message);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Fetch expiries when index changes
  useEffect(() => {
    fetchExpiries(selectedIndex);
    fetchMultiOiSummary(selectedIndex);
  }, [selectedIndex]);

  // Fetch option chain when expiry changes
  useEffect(() => {
    fetchOptionChain();
  }, [selectedExpiry]);

  const fetchExpiries = async (indexName) => {
    try {
      const res = await axios.get(`${API}/options/expiry/${indexName}`, { headers });
      if (res.data.success) {
        setExpiries(res.data.data);
        if (res.data.data.length > 0) {
          setSelectedExpiry(res.data.data[0]);
        }
      }
    } catch (error) {
      toast.error('Error fetching expiries!');
    }
  };

  const fetchOptionChain = async () => {
    if (!selectedExpiry) return;
    setLoadingChain(true);
    try {
      const res = await axios.get(`${API}/options/chain/${selectedIndex}/${selectedExpiry}`, { headers });
      if (res.data.success) {
        const allStrikes = res.data.data;
        const spot = res.data.spotPrice || 0;
        setSpotPrice(spot);

        // Filter strikes to show +/- 10 around the spot price
        let filteredChain = allStrikes;
        if (spot > 0) {
          const closestIndex = allStrikes.reduce((closest, curr, index) => {
            const currDiff = Math.abs(curr.strike - spot);
            const closestDiff = Math.abs(allStrikes[closest].strike - spot);
            return currDiff < closestDiff ? index : closest;
          }, 0);
          const start = Math.max(0, closestIndex - 10);
          const end = Math.min(allStrikes.length, closestIndex + 10);
          filteredChain = allStrikes.slice(start, end);
        } else {
          filteredChain = allStrikes.slice(0, 20);
        }

        setOptionChain(filteredChain);

        // Subscribe to socket tokens
        if (socketRef.current?.connected) {
          if (subscribedTokensRef.current.length > 0) {
            socketRef.current.emit('unsubscribe-tokens', { tokens: subscribedTokensRef.current });
          }

          const newTokens = [];
          filteredChain.forEach(row => {
            if (row.ce?.token) newTokens.push(row.ce.token);
            if (row.pe?.token) newTokens.push(row.pe.token);
          });

          const indexToken = INDEX_TOKENS[selectedIndex];
          if (indexToken) {
            newTokens.push(indexToken);
          }

          subscribedTokensRef.current = newTokens;
          socketRef.current.emit('subscribe-tokens', { tokens: newTokens });
        }
      }
    } catch (error) {
      toast.error('Error fetching option chain!');
    }
    setLoadingChain(false);
  };

  const addAlertMonitor = async (tokenVal) => {
    try {
      const res = await axios.post(`${API}/alerts/config`, { token: tokenVal }, { headers });
      if (res.data.success) {
        toast.success(res.data.message);
      } else {
        toast.error(res.data.message);
      }
    } catch (err) {
      toast.error('Failed to set up alert monitor!');
    }
  };

  const openTradeModal = (option, type, side) => {
    setTradeModal({ ...option, optionType: type, side });
    setQuantity(1);
  };

  const placeRealOrder = async () => {
    if (!tradeModal) return;
    try {
      const res = await axios.post(`${API}/positions/order`, {
        symbol: tradeModal.symbol,
        token: tradeModal.token,
        quantity: quantity * tradeModal.lotSize,
        side: tradeModal.side,
        price: tradeModal.ltp,
        exchange: 'NFO',
        producttype: 'CARRYOVER'
      }, { headers });

      if (res.data.success) {
        toast.success(`Real ${tradeModal.side} order placed successfully!`);
        setTradeModal(null);
      } else {
        toast.error(res.data.message || 'Order failed!');
      }
    } catch (error) {
      toast.error('Error executing real order!');
    }
  };

  // Find ATM strike closest to spot price
  const isAtmStrike = (strike) => {
    if (!spotPrice || optionChain.length === 0) return false;
    const closest = optionChain.reduce((prev, curr) => {
      return Math.abs(curr.strike - spotPrice) < Math.abs(prev.strike - spotPrice) ? curr : prev;
    });
    return strike === closest.strike;
  };

  // Compute OI Summary for 7 Strikes (3 Above ATM, 1 ATM, 3 Below ATM)
  const getOiSummary = () => {
    if (optionChain.length === 0 || !spotPrice) return null;
    
    const atmIndex = optionChain.reduce((closestIdx, curr, index) => {
      const currDiff = Math.abs(curr.strike - spotPrice);
      const closestDiff = Math.abs(optionChain[closestIdx].strike - spotPrice);
      return currDiff < closestDiff ? index : closestIdx;
    }, 0);

    let totalCeOi = 0;
    let totalPeOi = 0;

    for (let i = -3; i <= 3; i++) {
      const row = optionChain[atmIndex + i];
      if (row) {
        totalCeOi += Number(row.ce?.oi || 0);
        totalPeOi += Number(row.pe?.oi || 0);
      }
    }

    const pcr = totalCeOi > 0 ? Number((totalPeOi / totalCeOi).toFixed(2)) : 0;

    return { totalCeOi, totalPeOi, pcr };
  };

  const oiSummary = getOiSummary();

  return (
    <div className="app">
      <Toaster position="top-right" />

      <div className="header">
        <div>
          <h1>💼 Real Option Chain (AngelOne)</h1>
          <p className="subtitle" style={{ color: '#ff5252' }}>⚠️ REAL MONEY ORDER EXECUTION</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span className={`live-badge ${isLive ? 'active' : ''}`}>
            {isLive ? '🟢 LIVE' : '⚪ OFFLINE'}
          </span>
        </div>
      </div>

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

      {/* Option Chain Controls */}
      <div className="option-chain-card" style={{ border: '1px solid #ff5252' }}>
        <div className="chain-controls">
          <div className="input-group">
            <label>Index</label>
            <select value={selectedIndex} onChange={(e) => setSelectedIndex(e.target.value)}>
              <option value="NIFTY">NIFTY</option>
              <option value="BANKNIFTY">BANKNIFTY</option>
              <option value="FINNIFTY">FINNIFTY</option>
            </select>
          </div>
          <div className="input-group">
            <label>Expiry</label>
            <select value={selectedExpiry} onChange={(e) => setSelectedExpiry(e.target.value)}>
              {expiries.map(exp => (
                <option key={exp} value={exp}>{exp}</option>
              ))}
            </select>
          </div>
          <button className="btn-load" style={{ background: '#ff5252' }} onClick={() => { fetchOptionChain(); fetchMultiOiSummary(selectedIndex); }} disabled={loadingChain}>
            {loadingChain ? '⏳ Loading...' : '🔄 Load Chain'}
          </button>
        </div>

        {spotPrice > 0 && (
          <div className="spot-price-banner" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              ⚡ {selectedIndex} Index Spot: <strong style={{ color: '#ff5252', fontSize: '18px' }}>₹{spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <button
              onClick={() => setActiveChart({
                token: INDEX_TOKENS[selectedIndex],
                symbol: `${selectedIndex} INDEX`,
                exchange: 'NSE'
              })}
              style={{
                padding: '6px 12px',
                background: '#ff5252',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              📊 View Spot Chart
            </button>
          </div>
        )}

        {multiOiSummary.length > 0 && (
          <div className="settings-card" style={{ padding: '16px', marginBottom: '24px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>📊 7-Strike OI Summary across Expiries</h3>
            {loadingSummary ? (
              <div style={{ fontSize: '12px', color: '#64748b' }}>Loading summary data...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '10px 12px', fontWeight: '700' }}>Expiry</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700' }}>Total Call (CE) OI</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700' }}>Total Put (PE) OI</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700' }}>PCR</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '700' }}>Sentiment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multiOiSummary.map((sum, idx) => {
                      const isBullish = sum.pcr > 1.1;
                      const isBearish = sum.pcr < 0.9;
                      
                      const sentimentText = isBullish ? 'Bullish' : (isBearish ? 'Bearish' : 'Neutral');
                      const sentimentBg = isBullish ? '#dcfce7' : (isBearish ? '#fee2e2' : '#f1f5f9');
                      const sentimentColor = isBullish ? '#15803d' : (isBearish ? '#b91c1c' : '#475569');
                      
                      const highlight = sum.expiry === selectedExpiry;
                      return (
                        <tr 
                          key={idx} 
                          style={{ 
                            borderBottom: '1px solid #e2e8f0', 
                            background: highlight ? '#e0f2fe' : 'transparent',
                            fontWeight: highlight ? '700' : 'normal',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onClick={() => setSelectedExpiry(sum.expiry)}
                          onMouseEnter={(e) => { if (!highlight) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                          onMouseLeave={(e) => { if (!highlight) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <td style={{ padding: '10px 12px', color: highlight ? '#0369a1' : '#0f172a' }}>
                            {sum.expiry} {highlight && '👈'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b91c1c' }}>{sum.ceOi.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#15803d' }}>{sum.peOi.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', color: '#0f172a' }}>{sum.pcr.toFixed(2)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ 
                              display: 'inline-block',
                              padding: '4px 8px', 
                              borderRadius: '4px', 
                              fontSize: '11px', 
                              fontWeight: '700',
                              backgroundColor: sentimentBg,
                              color: sentimentColor
                            }}>
                              {sentimentText}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {spotPrice > 0 && oiSummary && (
          <div className="oi-summary-container" style={{ display: 'flex', gap: '16px', marginBottom: '20px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', justifyContent: 'space-around' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', display: 'block', textTransform: 'uppercase', marginBottom: '4px' }}>CE OI Sum (7 Strikes)</span>
              <strong style={{ fontSize: '16px', color: '#b91c1c' }}>{oiSummary.totalCeOi.toLocaleString('en-IN')}</strong>
            </div>
            <div style={{ width: '1px', background: '#cbd5e1' }}></div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', display: 'block', textTransform: 'uppercase', marginBottom: '4px' }}>PE OI Sum (7 Strikes)</span>
              <strong style={{ fontSize: '16px', color: '#047857' }}>{oiSummary.totalPeOi.toLocaleString('en-IN')}</strong>
            </div>
            <div style={{ width: '1px', background: '#cbd5e1' }}></div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', display: 'block', textTransform: 'uppercase', marginBottom: '4px' }}>Put-Call Ratio (PCR)</span>
              <strong style={{ fontSize: '16px', color: '#0ea5e9' }}>{oiSummary.pcr.toFixed(2)}</strong>
            </div>
          </div>
        )}

        {optionChain.length > 0 && (
          <div className="chain-table-wrapper">
            <table className="chain-table">
              <thead>
                <tr>
                  <th colSpan="3" className="ce-header" style={{ textAlign: 'center', background: '#e8f5e9', color: '#2e7d32' }}>CALL (CE)</th>
                  <th className="strike-header" style={{ textAlign: 'center', background: '#f5f5f5', color: '#616161' }}>STRIKE</th>
                  <th colSpan="3" className="pe-header" style={{ textAlign: 'center', background: '#ffebee', color: '#c62828' }}>PUT (PE)</th>
                </tr>
                <tr>
                  <th>OI</th>
                  <th>Volume</th>
                  <th>LTP</th>
                  <th></th>
                  <th>LTP</th>
                  <th>Volume</th>
                  <th>OI</th>
                </tr>
              </thead>
              <tbody>
                {optionChain.map((row, index) => {
                  const atm = isAtmStrike(row.strike);
                  return (
                    <tr key={index} className={atm ? 'atm-row' : ''} ref={atm ? atmRef : null}>
                      {/* CALL CE SIDE */}
                      <td>{row.ce?.oi ? Number(row.ce.oi).toLocaleString('en-IN') : '-'}</td>
                      <td>{row.ce?.volume ? Number(row.ce.volume).toLocaleString('en-IN') : '-'}</td>
                      <td className={`clickable-cell buy-trigger ce-ltp ${flashingCells.has(`ce-${row.ce?.token}`) ? 'price-flash' : ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <span style={{ flex: 1, paddingRight: '8px' }} onClick={() => row.ce && openTradeModal(row.ce, 'CE', 'BUY')}>
                            {row.ce?.ltp ? `₹${Number(row.ce.ltp).toFixed(2)}` : '-'}
                          </span>
                          {row.ce && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveChart({
                                    token: row.ce.token,
                                    symbol: row.ce.symbol,
                                    exchange: 'NFO'
                                  });
                                }}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', fontSize: '13px' }}
                                title="View Chart"
                              >
                                📊
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addAlertMonitor(row.ce.token);
                                }}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', fontSize: '13px' }}
                                title="Add EMA Alert"
                              >
                                🔔
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* STRIKE MIDDLE */}
                      <td className={`strike-price ${atm ? 'atm-badge' : ''}`}>
                        {row.strike.toLocaleString()}
                        {atm && <span className="atm-tag" style={{ background: '#ff5252' }}>ATM</span>}
                      </td>

                      {/* PUT PE SIDE */}
                      <td className={`clickable-cell buy-trigger pe-ltp ${flashingCells.has(`pe-${row.pe?.token}`) ? 'price-flash' : ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <span style={{ flex: 1, paddingRight: '8px' }} onClick={() => row.pe && openTradeModal(row.pe, 'PE', 'BUY')}>
                            {row.pe?.ltp ? `₹${Number(row.pe.ltp).toFixed(2)}` : '-'}
                          </span>
                          {row.pe && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveChart({
                                    token: row.pe.token,
                                    symbol: row.pe.symbol,
                                    exchange: 'NFO'
                                  });
                                }}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', fontSize: '13px' }}
                                title="View Chart"
                              >
                                📊
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addAlertMonitor(row.pe.token);
                                }}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', fontSize: '13px' }}
                                title="Add EMA Alert"
                              >
                                🔔
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>{row.pe?.volume ? Number(row.pe.volume).toLocaleString('en-IN') : '-'}</td>
                      <td>{row.pe?.oi ? Number(row.pe.oi).toLocaleString('en-IN') : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {optionChain.length === 0 && !loadingChain && (
          <p className="no-data">Select index and expiry, then click Load Chain!</p>
        )}
      </div>

      {/* Trade Modal */}
      {tradeModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ border: '2px solid #ff5252' }}>
            <h2 style={{ color: '#ff5252' }}>{tradeModal.side === 'BUY' ? '🛒 Buy Option (REAL)' : '📤 Sell Option (REAL)'}</h2>
            
            {/* BUY / SELL Switch Toggle inside modal */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button 
                type="button"
                onClick={() => setTradeModal(prev => ({ ...prev, side: 'BUY' }))}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #10b981',
                  background: tradeModal.side === 'BUY' ? '#10b981' : '#ffffff',
                  color: tradeModal.side === 'BUY' ? '#ffffff' : '#10b981',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                BUY
              </button>
              <button 
                type="button"
                onClick={() => setTradeModal(prev => ({ ...prev, side: 'SELL' }))}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #ef4444',
                  background: tradeModal.side === 'SELL' ? '#ef4444' : '#ffffff',
                  color: tradeModal.side === 'SELL' ? '#ffffff' : '#ef4444',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                SELL
              </button>
            </div>

            <div className="modal-details">
              <p><span>Symbol:</span> {tradeModal.symbol}</p>
              <p><span>Type:</span> <span className={`type-badge ${tradeModal.optionType === 'CE' ? 'ce' : 'pe'}`}>{tradeModal.optionType}</span></p>
              <p><span>LTP:</span> ₹{tradeModal.ltp}</p>
              <p><span>Lot Size:</span> {tradeModal.lotSize}</p>
            </div>
            <div className="input-group">
              <label>Number of Lots</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>
            <div className="modal-cost">
              <p>Total Quantity: {quantity * tradeModal.lotSize}</p>
              {tradeModal.side === 'BUY' ? (
                <p>Est. Premium Required: ₹{(quantity * tradeModal.lotSize * tradeModal.ltp).toLocaleString('en-IN')}</p>
              ) : (
                <p>Est. Margin Credit: ₹{(quantity * tradeModal.lotSize * tradeModal.ltp).toLocaleString('en-IN')}</p>
              )}
            </div>
            <div className="modal-buttons">
              <button
                className="btn-start"
                style={{ background: '#ff5252' }}
                onClick={placeRealOrder}
              >
                {tradeModal.side === 'BUY' ? '🔥 Execute Buy' : '🔥 Execute Sell'}
              </button>
              <button className="btn-cancel" onClick={() => setTradeModal(null)}>❌ Cancel</button>
            </div>
          </div>
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

export default RealTrading;
