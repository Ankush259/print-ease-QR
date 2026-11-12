import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Printer, RefreshCw, ExternalLink, Lock, Settings, Check, LogOut } from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

export default function ShopDashboard() {
  const { shopId } = useParams();
  const [shop, setShop] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

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

  // 1. Load shop info and rate card ONLY ONCE on initial load
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

  // 2. Poll ONLY the print queue every 4 seconds (never overwrites rate inputs)
  const fetchJobsOnly = async () => {
    try {
      const jobsRes = await axios.get(`${API_BASE}/api/jobs/shop/${shopId}`);
      setJobs(jobsRes.data);
    } catch (err) {
      console.error("Jobs polling error:", err);
    }
  };

  useEffect(() => {
    fetchShopDetails();
    fetchJobsOnly();
    const interval = setInterval(fetchJobsOnly, 4000);
    return () => clearInterval(interval);
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

  if (loading) return <div className="p-8 text-center">Loading Shop Dashboard...</div>;
  if (!shop) return <div className="p-8 text-center text-red-600">Shop not found</div>;

  // Render PIN Login Gate if not authenticated
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
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Printer className="w-5 h-5 text-indigo-600" />
              Live Print Queue
            </h2>
            <button
              onClick={fetchJobsOnly}
              className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {jobs.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No print jobs in queue yet.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.job_id}
                  className="border rounded-xl p-4 flex items-center justify-between hover:bg-slate-50 transition"
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-sm text-slate-900">{job.file_name}</p>
                    <p className="text-xs text-slate-500">
                      {job.total_pages} pg • {job.copies} copies • <b>{job.color_mode}</b> • {job.sides} • Range:{" "}
                      {job.page_range}
                    </p>
                    <span
                      className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${
                        job.payment_status === "PAID"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {job.payment_status} — ₹{job.calculated_amount}
                    </span>
                  </div>

                  <a
                    href={`${API_BASE}${job.file_path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow"
                  >
                    Open & Print PDF
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}