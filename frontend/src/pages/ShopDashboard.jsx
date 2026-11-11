import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Printer, RefreshCw, ExternalLink } from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

export default function ShopDashboard() {
  const { shopId } = useParams();
  const [shop, setShop] = useState(null);
  const [jobs, setJobs] = useState([]);

  const fetchQueue = async () => {
    const res = await axios.get(`${API_BASE}/api/jobs/shop/${shopId}`);
    setJobs(res.data);
  };

  useEffect(() => {
    axios.get(`${API_BASE}/api/shops/${shopId}`).then((res) => setShop(res.data));
    fetchQueue();
    const interval = setInterval(fetchQueue, 4000); // Poll every 4 seconds
    return () => clearInterval(interval);
  }, [shopId]);

  if (!shop) return <div className="p-8">Loading Shop Dashboard...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
        {/* Left Column: Shop Info & QR Code */}
        <div className="bg-white p-6 rounded-2xl shadow space-y-4 h-fit text-center">
          <h2 className="text-xl font-bold text-slate-900">{shop.shop_name}</h2>
          <p className="text-xs text-slate-500">Customer Scan-to-Print QR</p>
          <img
            src={`${API_BASE}${shop.qr_code_path}`}
            alt="Shop QR"
            className="w-48 h-48 mx-auto border p-2 rounded-xl"
          />
          <a
            href={`/shop/${shop.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:underline"
          >
            Open Customer Portal <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Right Column: Live Print Queue */}
        <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <Printer className="w-5 h-5 text-indigo-600" /> Live Print Queue
            </h3>
            <button onClick={fetchQueue} className="text-xs flex items-center gap-1 text-slate-600 hover:text-indigo-600">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          {jobs.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No print jobs yet.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.job_id} className="border rounded-xl p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold text-sm text-slate-900">{job.file_name}</p>
                    <p className="text-xs text-slate-500">
                      {job.total_pages} pg • {job.copies} copies • <b>{job.color_mode}</b> • {job.sides} • Range: {job.page_range}
                    </p>
                    <span
                      className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${
                        job.payment_status === "PAID" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {job.payment_status} — ₹{job.calculated_amount}
                    </span>
                  </div>

                  <a
                    href={`${API_BASE}${job.file_path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg"
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