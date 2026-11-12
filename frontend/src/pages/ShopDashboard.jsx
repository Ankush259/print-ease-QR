import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import {
  Printer,
  RefreshCw,
  ExternalLink,
  Lock,
  Settings,
  Check,
  LogOut,
  Volume2,
  VolumeX,
  Wifi,
  CheckCircle,
  Trash2,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";
const WS_BASE = "ws://127.0.0.1:8000";

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.setValueAtTime(880, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  } catch (e) {
    console.warn("Audio chime blocked until user interacts with page:", e);
  }
}

export default function ShopDashboard() {
  const { shopId } = useParams();
  const [shop, setShop] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queueTab, setQueueTab] = useState("QUEUED"); // "QUEUED" or "COMPLETED"

  // WebSocket & Audio State
  const [wsConnected, setWsConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);

  // Auth State
  const storageKey = `printease_token_${shopId}`;
  const [token, setToken] = useState(() => localStorage.getItem(storageKey) || "");
  const [pinInput, setPinInput] = useState("");
  const [authError, setAuthError] = useState("");

  // Live Pricing Editor State
  const [rates, setRates] = useState({
    bw_single_price: 2,
    bw_double_price: 3,
    color_single_price: 10,
    color_double_price: 15,
  });
  const [savingRates, setSavingRates] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    if (next) playNotificationChime();
  };

  const fetchShopDetails = async () => {
    try {
      const shopRes = await axios.get(`${API_BASE}/api/shops/${shopId}`);
      setShop(shopRes.data);
      if (shopRes.data.pricing) {
        setRates({
          bw_single_price: shopRes.data.pricing.bw_single_price,
          bw_double_price: shopRes.data.pricing.bw_double_price,
          color_single_price: shopRes.data.pricing.color_single_price,
          color_double_price: shopRes.data.pricing.color_double_price,
        });
      }
    } catch (err) {
      console.error("Shop fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobsOnly = async () => {
    try {
      const jobsRes = await axios.get(`${API_BASE}/api/jobs/shop/${shopId}`);
      setJobs(jobsRes.data);
    } catch (err) {
      console.error("Jobs fetch error:", err);
    }
  };

  useEffect(() => {
    fetchShopDetails();
    fetchJobsOnly();

    const ws = new WebSocket(`${WS_BASE}/api/jobs/ws/${shopId}`);

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      fetchJobsOnly();
      if ((data.event === "NEW_JOB" || data.event === "JOB_PAID") && soundEnabledRef.current) {
        playNotificationChime();
      }
    };

    return () => ws.close();
  }, [shopId]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await axios.post(`${API_BASE}/api/shops/${shopId}/login`, {
        password: pinInput,
      });
      localStorage.setItem(storageKey, res.data.token);
      setToken(res.data.token);
      setPinInput("");
    } catch (err) {
      setAuthError(err.response?.data?.detail || "Login failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(storageKey);
    setToken("");
  };

  const handleSavePricing = async (e) => {
    e.preventDefault();
    setSavingRates(true);
    try {
      const res = await axios.put(
        `${API_BASE}/api/shops/${shopId}/pricing`,
        {
          bw_single_price: Number(rates.bw_single_price),
          bw_double_price: Number(rates.bw_double_price),
          color_single_price: Number(rates.color_single_price),
          color_double_price: Number(rates.color_double_price),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShop(res.data);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2500);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to update rates");
    } finally {
      setSavingRates(false);
    }
  };

  const handleCompleteJob = async (jobId) => {
    try {
      await axios.patch(`${API_BASE}/api/jobs/${jobId}/complete`);
      fetchJobsOnly();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to mark job completed");
    }
  };

  const handlePrintQrPoster = () => {
    const posterWindow = window.open("", "_blank", "width=700,height=900");
    if (!posterWindow) return;
    posterWindow.document.write(`
      <html>
        <head>
          <title>${shop.shop_name} - QR Standee Poster</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; color: #0f172a; }
            .card { border: 4px solid #4f46e5; border-radius: 24px; padding: 40px; max-width: 520px; margin: 0 auto; }
            .badge { background: #e0e7ff; color: #4338ca; font-weight: 800; padding: 6px 16px; border-radius: 999px; font-size: 14px; letter-spacing: 1px; }
            h1 { font-size: 34px; margin: 16px 0 8px; }
            p.sub { color: #475569; font-size: 16px; margin-bottom: 24px; }
            img { width: 280px; height: 280px; border: 2px solid #e2e8f0; padding: 12px; border-radius: 16px; }
            .steps { text-align: left; background: #f8fafc; padding: 20px 28px; border-radius: 16px; margin: 24px 0; font-size: 15px; line-height: 1.8; }
            .rates { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px; background: #eef2ff; padding: 16px; border-radius: 12px; font-weight: 600; }
            .footer { margin-top: 20px; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">NO WHATSAPP • NO EMAIL • INSTANT PRINT</span>
            <h1>${shop.shop_name}</h1>
            <p class="sub">Scan QR Code to Upload & Print Documents Automatically</p>
            <img src="${API_BASE}${shop.qr_code_path}" alt="Shop QR" />
            <div class="steps">
              <b>1. Scan QR Code</b> with your phone camera or any UPI app.<br/>
              <b>2. Attach PDFs or Photos</b> and choose Black & White or Color.<br/>
              <b>3. Pay Online</b> — your document prints automatically & deletes after printing!
            </div>
            <div class="rates">
              <div>B&W Single: ₹${shop.pricing.bw_single_price}/pg</div>
              <div>B&W Double: ₹${shop.pricing.bw_double_price}/sheet</div>
              <div>Color Single: ₹${shop.pricing.color_single_price}/pg</div>
              <div>Color Double: ₹${shop.pricing.color_double_price}/sheet</div>
            </div>
            <div class="footer">Powered by PrintEase QR • Privacy-First Auto File Wipe</div>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    posterWindow.document.close();
  };

  if (loading) return <div className="p-8 text-center">Loading Shop Dashboard...</div>;
  if (!shop) return <div className="p-8 text-center text-red-600">Shop not found</div>;

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white max-w-sm w-full rounded-2xl shadow-lg p-6 space-y-5 text-center">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{shop.shop_name}</h1>
            <p className="text-xs text-slate-500">Enter Shopkeeper PIN to unlock dashboard (Default: 1234)</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              placeholder="Enter PIN (1234)"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full border rounded-xl p-3 text-center tracking-widest text-lg font-bold"
              required
            />
            {authError && <p className="text-xs text-red-600 font-medium">{authError}</p>}
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl shadow transition"
            >
              Unlock Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Live Shop Revenue & Print Volume Analytics
  const paidJobs = jobs.filter((j) => j.payment_status === "PAID");
  const totalRevenue = paidJobs.reduce((sum, j) => sum + j.calculated_amount, 0);
  const totalPagesPrinted = paidJobs.reduce((sum, j) => sum + j.total_pages * j.copies, 0);

  const activeJobs = jobs.filter((j) => j.print_status === "QUEUED");
  const completedJobs = jobs.filter((j) => j.print_status === "COMPLETED");
  const displayedJobs = queueTab === "QUEUED" ? activeJobs : completedJobs;

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Shop QR Card & Live Rate Editor */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow p-6 flex flex-col items-center text-center space-y-4">
            <div className="w-full flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900">{shop.shop_name}</h2>
              <button
                onClick={handleLogout}
                title="Lock Dashboard"
                className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1"
              >
                <LogOut className="w-4 h-4" /> Lock
              </button>
            </div>
            <p className="text-xs text-slate-500">Customer Scan-to-Print QR</p>
            {shop.qr_code_path && (
              <img
                src={`${API_BASE}${shop.qr_code_path}`}
                alt="Shop QR"
                className="w-44 h-44 border p-2 rounded-xl"
              />
            )}
            <Link
              to={`/shop/${shop.id}`}
              target="_blank"
              className="text-xs text-indigo-600 font-semibold flex items-center gap-1 hover:underline"
            >
              Open Customer Portal <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={handlePrintQrPoster}
              className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold py-2 rounded-xl flex items-center justify-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" /> Print A4 Shop QR Poster
            </button>
          </div>

          {/* Live Rate Card Editor */}
          <form onSubmit={handleSavePricing} className="bg-white rounded-2xl shadow p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-indigo-600" /> Live Rate Card (₹)
              </span>
              {savedBanner && (
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Updated!
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-500 font-medium">B&W Single</label>
                <input
                  type="number"
                  step="0.5"
                  value={rates.bw_single_price}
                  onChange={(e) => setRates({ ...rates, bw_single_price: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-500 font-medium">B&W Double</label>
                <input
                  type="number"
                  step="0.5"
                  value={rates.bw_double_price}
                  onChange={(e) => setRates({ ...rates, bw_double_price: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-500 font-medium">Color Single</label>
                <input
                  type="number"
                  step="0.5"
                  value={rates.color_single_price}
                  onChange={(e) => setRates({ ...rates, color_single_price: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-500 font-medium">Color Double</label>
                <input
                  type="number"
                  step="0.5"
                  value={rates.color_double_price}
                  onChange={(e) => setRates({ ...rates, color_double_price: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 font-semibold"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingRates}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold py-2.5 rounded-xl transition"
            >
              {savingRates ? "Saving..." : "Save Live Rates"}
            </button>
          </form>
        </div>

        {/* Right Column: Live Print Queue */}
        <div className="md:col-span-2 bg-white rounded-2xl shadow p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="flex items-center gap-2.5">
              <Printer className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Live Print Queue</h2>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                  wsConnected
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                <Wifi className="w-3 h-3" />
                {wsConnected ? "Live WebSocket" : "Reconnecting..."}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleSound}
                className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium transition ${
                  soundEnabled
                    ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {soundEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5" /> Sound On
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5" /> Muted
                  </>
                )}
              </button>

              <button
                onClick={fetchJobsOnly}
                className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          </div>

          {/* 3-Card Live Shop Revenue & Volume Analytics Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
              <p className="text-[11px] font-semibold uppercase text-emerald-700">Paid Revenue</p>
              <p className="text-xl font-bold text-emerald-900">₹{totalRevenue.toFixed(2)}</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
              <p className="text-[11px] font-semibold uppercase text-indigo-700">Paid Orders</p>
              <p className="text-xl font-bold text-indigo-900">{paidJobs.length} jobs</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] font-semibold uppercase text-slate-600">Total Pages</p>
              <p className="text-xl font-bold text-slate-900">{totalPagesPrinted} pgs</p>
            </div>
          </div>

          {/* Queue Status Filter Tabs */}
          <div className="flex gap-2 border-b pb-2 text-xs font-semibold">
            <button
              onClick={() => setQueueTab("QUEUED")}
              className={`px-3 py-1.5 rounded-lg transition ${
                queueTab === "QUEUED"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Active Queue ({activeJobs.length})
            </button>
            <button
              onClick={() => setQueueTab("COMPLETED")}
              className={`px-3 py-1.5 rounded-lg transition ${
                queueTab === "COMPLETED"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Completed & Wiped ({completedJobs.length})
            </button>
          </div>

          {displayedJobs.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              {queueTab === "QUEUED"
                ? "No active print jobs waiting in queue."
                : "No completed jobs yet."}
            </p>
          ) : (
            <div className="space-y-3">
              {displayedJobs.map((job) => (
                <div
                  key={job.job_id}
                  className="border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 transition"
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-sm text-slate-900">{job.file_name}</p>
                    <p className="text-xs text-slate-500">
                      {job.total_pages} pg • {job.copies} copies • <b>{job.color_mode}</b> • {job.sides} • Range:{" "}
                      {job.page_range}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${
                          job.payment_status === "PAID"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {job.payment_status} — ₹{job.calculated_amount}
                      </span>
                      {job.print_status === "COMPLETED" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          <Trash2 className="w-3 h-3" /> PDF Wiped for Privacy
                        </span>
                      )}
                    </div>
                  </div>

                  {job.print_status === "QUEUED" ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={`${API_BASE}${job.file_path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2.5 rounded-lg shadow"
                      >
                        Open & Print PDF
                      </a>
                      <button
                        onClick={() => handleCompleteJob(job.job_id)}
                        title="Mark printed and wipe customer PDF from server"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2.5 rounded-lg shadow flex items-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Done & Wipe
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" /> Printed
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}