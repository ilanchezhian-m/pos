import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { items } from './data/items'
import PrintPage from './pages/PrintPage'
import {
  listBills,
  listOrders,
  listPrintJobs,
  markSynced,
  saveBill,
  saveOrder,
  savePrintJob,
  updatePrintStatus,
} from './lib/db'

const tableGroups = [
  { label: 'Parcel', slots: ['Parcel'] },
  { label: 'A', slots: ['A1', 'A2', 'A3'] },
  { label: 'B', slots: ['B1', 'B2', 'B3'] },
  { label: 'C', slots: ['C1', 'C2', 'C3', 'C4'] },
  { label: 'F', slots: ['F1', 'F2', 'F4'] },
]

function App() {
  const [orderForm, setOrderForm] = useState({ customer: '', table: 'A1', payment: 'UPI' })
  const [orders, setOrders] = useState([])
  const [bills, setBills] = useState([])
  const [prints, setPrints] = useState([])
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [flowStarted, setFlowStarted] = useState(false)
  const [currentView, setCurrentView] = useState('order') // 'order' or 'print'
  const [orderLines, setOrderLines] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  const getNextOrderNumber = useCallback(() => {
    try {
      const raw = localStorage.getItem('orderNumberCounter')
      const current = raw ? parseInt(raw, 10) : 1001
      const next = current + 1
      localStorage.setItem('orderNumberCounter', String(next))
      return current
    } catch (err) {
      console.error('order number failed', err)
      return Math.floor(Date.now() / 1000)
    }
  }, [])

  const categories = useMemo(() => ['All', ...new Set(items.map((i) => i.category || 'Other'))], [])
  const categoryTone = useCallback((cat) => {
    const name = (cat || '').toUpperCase()
    if (name.includes('VEG')) return 'veg'
    if (
      name.includes('NON VEG') ||
      name.includes('SEA FOOD') ||
      name.includes('EGG') ||
      name.includes('BIRI') ||
      name.includes('TANDOORI') ||
      name.includes('BBQ') ||
      name.includes('GRILL') ||
      name.includes('SHAWARMA')
    ) return 'non-veg'
    return ''
  }, [])
  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return items
      .filter((it) => selectedCategory === 'All' || it.category === selectedCategory)
      .filter((it) => (term ? it.name.toLowerCase().includes(term) : true))
  }, [selectedCategory, searchTerm])

  function addLine(item) {
    setOrderLines((lines) => {
      const existing = lines.find((l) => l.id === item.id)
      if (existing) {
        return lines.map((l) => (l.id === item.id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [{ id: item.id, name: item.name, price: item.price, qty: 1 }, ...lines]
    })
    setFlowStarted(true)
  }

  function changeLineQty(itemId, delta) {
    setOrderLines((lines) => {
      const next = lines
        .map((l) => (l.id === itemId ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0)
      return next
    })
  }

  const paymentMethods = ['UPI', 'Cash', 'Card']
  const selectTable = (slot) => {
    setOrderForm((f) => ({ ...f, table: slot }))
    setFlowStarted(true)
  }
  const changeTable = () => setFlowStarted(false)
  const goHome = useCallback(() => {
    setCurrentView('order')
    setFlowStarted(false)
    setOrderLines([])
  }, [])

  const fakePostToLocalServer = useCallback((payload) => {
    void payload
    return new Promise((resolve) => {
      // Simulated LAN call; replace with fetch('http://pc-local:5001/sync', { method: 'POST', body: JSON.stringify(payload) })
      setTimeout(resolve, 800)
    })
  }, [])

  const trySync = useCallback(async () => {
    if (!isOnline) return
    const [latestOrders, latestBills, latestPrints] = await Promise.all([
      listOrders(),
      listBills(),
      listPrintJobs(),
    ])

    const unsyncedOrders = latestOrders.filter((o) => !o.synced)
    const unsyncedBills = latestBills.filter((b) => !b.synced)
    const unsyncedPrints = latestPrints.filter((p) => !p.synced)

    const payload = { orders: unsyncedOrders, bills: unsyncedBills, prints: unsyncedPrints }
    if (!payload.orders.length && !payload.bills.length && !payload.prints.length) return

    try {
      await fakePostToLocalServer(payload)
      await Promise.all([
        ...unsyncedOrders.map((o) => markSynced('orders', o.id)),
        ...unsyncedBills.map((b) => markSynced('bills', b.id)),
        ...unsyncedPrints.map((p) => markSynced('prints', p.id)),
      ])
      setOrders(latestOrders.map((o) => ({ ...o, synced: true })))
      setBills(latestBills.map((b) => ({ ...b, synced: true })))
      setPrints(latestPrints.map((p) => ({ ...p, synced: true })))
    } catch (err) {
      console.error('Sync failed', err)
    }
  }, [fakePostToLocalServer, isOnline])

  useEffect(() => {
    let active = true
    ;(async () => {
      const [o, b, p] = await Promise.all([listOrders(), listBills(), listPrintJobs()])
      if (!active) return
      setOrders(o)
      setBills(b)
      setPrints(p)
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    const handleResize = () => {
      // Track window resize but don't use for now
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      trySync()
    }, 7000)
    return () => clearInterval(id)
  }, [trySync])

  const orderTotal = useMemo(() => orderLines.reduce((sum, line) => sum + line.price * line.qty, 0), [orderLines])

  async function handleCreateOrder(e, mode = 'kot') {
    if (e?.preventDefault) e.preventDefault()
    if (!orderLines.length) return
    const isDelivery = (orderForm.table || '').toLowerCase() === 'parcel'
    const summary = orderLines.map((l) => `${l.name} x${l.qty}`).join(', ')
    const status = mode === 'bill' || isDelivery ? 'billed' : 'new'
    const orderNumber = getNextOrderNumber()

    const order = {
      customer: orderForm.customer || 'Walk-in',
      table: orderForm.table || 'Parcel',
      items: orderLines,
      total: orderTotal,
      payment: orderForm.payment,
      status,
      summary,
      orderNumber,
    }

    const savedOrder = await saveOrder(order)

    // Queue KOT only for dine-in when requested
    if (!isDelivery && mode === 'kot') {
      const kotJob = await savePrintJob({ type: 'KOT', refId: savedOrder.id, status: 'queued' })
      setPrints((prev) => [kotJob, ...prev])
    }

    // Create bill + print when delivery or explicit bill request
    if (isDelivery || mode === 'bill') {
      const bill = {
        orderId: savedOrder.id,
        customer: order.customer,
        table: order.table,
        total: order.total,
        items: orderLines,
        status: 'ready',
        paymentMethod: order.payment,
        orderNumber: order.orderNumber,
      }
      const savedBill = await saveBill(bill)
      const billJob = await savePrintJob({ type: 'BILL', refId: savedBill.id, status: 'queued' })
      setBills((prev) => [savedBill, ...prev])
      setPrints((prev) => [billJob, ...prev])
      setOrders((prev) => [{ ...savedOrder, status: 'billed' }, ...prev])
      setCurrentView('print')
    } else {
      setOrders((prev) => [savedOrder, ...prev])
    }

    setOrderLines([])
    setOrderForm((f) => ({ ...f }))
  }

  async function handleCreateBill(order) {
    const billItems = order.items && order.items.length
      ? order.items
      : [{ name: order.item, qty: order.qty, price: order.price }]
    const orderNumber = order.orderNumber || order.id?.slice(0, 6) || 'N/A'
    const bill = {
      orderId: order.id,
      customer: order.customer,
      table: order.table,
      total: order.total,
      items: billItems,
      status: 'ready',
      paymentMethod: order.payment,
      orderNumber,
    }
    const savedBill = await saveBill(bill)
    setBills((prev) => [savedBill, ...prev])
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: 'billed' } : o)))
    const printJob = await savePrintJob({ type: 'BILL', refId: savedBill.id, status: 'queued' })
    setPrints((prev) => [printJob, ...prev])
  }

  async function handlePrintBill(bill) {
    const existing = prints.find((p) => p.type === 'BILL' && p.refId === bill.id && p.status !== 'done')
    if (existing) return
    const job = await savePrintJob({ type: 'BILL', refId: bill.id, status: 'queued' })
    setPrints((prev) => [job, ...prev])
  }

  async function handleMarkPrinted(jobId) {
    await updatePrintStatus(jobId, 'done')
    setPrints((prev) => prev.map((p) => (p.id === jobId ? { ...p, status: 'done' } : p)))
  }

  const isDelivery = orderForm.table === 'Parcel'

  return (
    <div className="app-shell">
      <header className="app-header">
        <button type="button" className="header-back" onClick={goHome} aria-label="Home">
          ⌂ Home
        </button>
        {currentView === 'order' && flowStarted && (
          <button type="button" className="header-back" onClick={changeTable} aria-label="Back to tables">
            ← Tables
          </button>
        )}
        <div className="brand">
          <span role="img" aria-label="pos">
            💳
          </span>
          PetPooja POS
          <span className="pill">Offline-first</span>
          {currentView === 'order' && flowStarted && (
            <span className="pill selected-table">Table: {orderForm.table || 'Parcel'}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button
            onClick={() => setCurrentView(currentView === 'order' ? 'print' : 'order')}
            style={{
              padding: '8px 16px',
              background: currentView === 'print' ? '#ff6b6b' : '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px'
            }}
          >
            {currentView === 'order' ? '🖨️ Print Center' : '📋 Order Entry'}
          </button>
          <div className="pill">
            <span className={`status-dot ${isOnline ? 'status-online' : 'status-offline'}`} /> {isOnline ? 'Online (LAN + HTTP/WebSocket)' : 'Offline (queueing)' }
          </div>
        </div>
      </header>

      {currentView === 'print' ? (
        <PrintPage />
      ) : !flowStarted ? (
        <div className="start-screen">
          <div className="start-card">
            <h2>Choose Table or Parcel</h2>
            <p className="panel-subtitle">Pick a table row or Parcel to start taking the order.</p>
            <div className="table-group-wrapper">
              {tableGroups.map((group) => (
                <div key={group.label} className="table-group">
                  <div className="table-group-label">{group.label}</div>
                  <div className="table-row">
                    {group.slots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        className="table-tile"
                        onClick={() => selectTable(slot)}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
      <>
      <div className="board">
        <aside className="panel sidebar">
          <h3 className="panel-title">Categories</h3>
          <div className="category-list">
            {categories.map((cat) => {
              const active = selectedCategory === cat
              return (
                <button
                  key={cat}
                  type="button"
                  className={`pill-btn block ${active ? 'active' : ''} ${categoryTone(cat)}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              )
            })}
          </div>
        </aside>

        <section className="panel items-panel">
          <div className="panel-header">
            <div className="panel-title">Items</div>
            <div className="muted small">{filteredItems.length} items • Click to add, double-click to add +1</div>
          </div>
          <div className="items-search">
            <input
              className="input"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button type="button" className="pill subtle" onClick={() => setSearchTerm('')}>
                Clear
              </button>
            )}
          </div>
          <div className="items-grid">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="item-card"
                onClick={() => addLine(item)}
                onDoubleClick={() => addLine(item)}
              >
                <div className="item-name">{item.name}</div>
                <div className="item-meta">
                  <span className="item-price">₹{item.price}</span>
                </div>
              </button>
            ))}
          </div>
        </section>


{/* order summary */}
        <section className="panel order-panel">
          <div className="panel-title">Order Summary</div>
          <p className="panel-subtitle">Add items, adjust qty per line, choose payment, then save.</p>
          <form className="order-form" onSubmit={handleCreateOrder}>
            <label className="muted">Customer</label>
            <input
              className="input"
              placeholder="Walk-in"
              value={orderForm.customer}
              onChange={(e) => setOrderForm((f) => ({ ...f, customer: e.target.value }))}
            />

            <div className="order-tags">
              <span className="pill dark">{orderForm.table || 'Parcel'}</span>
              <span className="pill subtle">{orderForm.payment}</span>
              <button type="button" className="pill subtle" onClick={changeTable}>Change</button>
            </div>

            <div className="panel-subtitle small">Items</div>

            <div className="order-lines">
              {orderLines.length === 0 && <div className="muted">No items yet. Click items to add.</div>}
              {orderLines.map((line) => (
                <div key={line.id} className="order-line">
                  <div className="order-item-name">{line.name}</div>
                  <div className="order-line-right">
                    <div className="qty-control">
                      <button type="button" className="qty-btn" onClick={() => changeLineQty(line.id, -1)}>
                        −
                      </button>
                      <span className="pill subtle qty-pill">{line.qty}</span>
                      <button type="button" className="qty-btn" onClick={() => changeLineQty(line.id, +1)}>
                        +
                      </button>
                    </div>
                    <div className="order-line-price">₹{line.price * line.qty}</div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="muted">Payment</label>
              <div className="payment-row">
                {paymentMethods.map((method) => {
                  const active = orderForm.payment === method
                  return (
                    <button
                      key={method}
                      type="button"
                      className={`pay-btn ${active ? 'active' : ''}`}
                      onClick={() => setOrderForm((f) => ({ ...f, payment: method }))}
                    >
                      {method}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="order-total">
              <div>
                <div className="muted small">Total</div>
                <div className="order-total-value">₹{orderTotal}</div>
              </div>
              <div className="order-total-actions">
                <button
                  className="button"
                  type="submit"
                  disabled={orderLines.length === 0}
                  onClick={(e) => handleCreateOrder(e, isDelivery ? 'bill' : 'kot')}
                >
                  {isDelivery ? 'Save & Bill' : 'Save & KOT'}
                </button>
                {!isDelivery && (
                  <button
                    className="button"
                    type="button"
                    disabled={orderLines.length === 0}
                    onClick={(e) => handleCreateOrder(e, 'bill')}
                  >
                    Print Bill
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>
      </div>

      <div className="panels-row">
          <section className="panel">
            <h2>Orders</h2>
            <p className="panel-subtitle">Recent orders awaiting billing or sync.</p>
            <div className="list">
              {orders.length === 0 && <div className="muted">No orders yet.</div>}
              {orders.map((order) => (
                <div key={order.id} className="list-item">
                  <div>
                    <div><strong>{order.customer}</strong> • {order.summary || `${order.item} x ${order.qty}`}</div>
                    <div className="muted">₹{order.total} • {order.table} • {order.status}</div>
                  </div>
                  <div className="toolbar">
                    <span className="tag">{order.synced ? 'synced' : 'queued'}</span>
                    {order.status !== 'billed' && (
                      <button className="button secondary" type="button" onClick={() => handleCreateBill(order)}>
                        Make Bill
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>Bills</h2>
            <p className="panel-subtitle">Ready for printing at the PC.</p>
            <div className="list">
              {bills.length === 0 && <div className="muted">No bills yet.</div>}
              {bills.map((bill) => {
                const hasQueuedBillPrint = prints.some(
                  (p) => p.type === 'BILL' && p.refId === bill.id && p.status !== 'done',
                )
                return (
                  <div key={bill.id} className="list-item">
                    <div>
                      <div><strong>{bill.customer}</strong> • ₹{bill.total}</div>
                      <div className="muted">Table {bill.table} • {bill.items?.[0]?.qty} item(s)</div>
                    </div>
                    <div className="toolbar">
                      <span className="tag">{bill.synced ? 'synced' : 'queued'}</span>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={hasQueuedBillPrint}
                        onClick={() => handlePrintBill(bill)}
                      >
                        {hasQueuedBillPrint ? 'Bill in queue' : 'Print Bill'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
          <section className="panel">
            <h2>Print Queue</h2>
            <p className="panel-subtitle">PC listens on LAN, triggers browser print/helper.</p>
            <div className="list">
              {prints.length === 0 && <div className="muted">No print jobs.</div>}
              {prints.map((job) => (
                <div key={job.id} className="list-item">
                  <div>
                    <div><strong>{job.type}</strong> • ref {job.refId?.slice(0, 6)}</div>
                    <div className="muted">{job.status}</div>
                  </div>
                  <div className="toolbar">
                    <span className="tag">{job.synced ? 'synced' : 'queued'}</span>
                    {job.status !== 'done' && (
                      <button className="button secondary" type="button" onClick={() => handleMarkPrinted(job.id)}>
                        Mark Printed
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </>
      )}
    </div>
  )
}

export default App
