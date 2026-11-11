import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Printer, QrCode, ArrowRight } from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

export default function HomeRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    shop_name: "",
    owner_email: "",
    upi_id: "",
    bw_single_price: 2,
    bw_double_price: 3,
    color_single_price: 10,
    color_double_price: 15,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/shops/`, {
        shop_name: form.shop_name,
        owner_email: form.owner_email,
        upi_id: form.upi_id,
        pricing: {
          bw_single_price: Number(form.bw_single_price),
          bw_double_price: Number(form.bw_double_price),
          color_single_price: Number(form.color_single_price),
          color_double_price: Number(form.color_double_price),
        },
      });
      navigate(`/dashboard/${res.data.id}`);
    } catch (err) {
      alert(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="flex items-center gap-3 border-b pb-4">
          <div className="p-3 bg-indigo-600 text-white rounded-xl">
            <QrCode className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">PrintEase QR</h1>
            <p className="text-xs text-slate-500">Register your print shop & generate your customer QR code</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">Shop Name</label>
            <input
              required
              placeholder="e.g., MP Nagar Digital Prints"
              value={form.shop_name}
              onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
              className="w-full mt-1 border rounded-lg p-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Owner Email</label>
              <input
                required
                type="email"
                placeholder="shop@example.com"
                value={form.owner_email}
                onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                className="w-full mt-1 border rounded-lg p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Shop UPI ID</label>
              <input
                required
                placeholder="shopname@upi"
                value={form.upi_id}
                onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
                className="w-full mt-1 border rounded-lg p-2.5 text-sm"
              />
            </div>
          </div>

          <div className="pt-2">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-2">Per-Page Pricing (₹)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600">B&W Single-Sided</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.bw_single_price}
                  onChange={(e) => setForm({ ...form, bw_single_price: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">B&W Double-Sided</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.bw_double_price}
                  onChange={(e) => setForm({ ...form, bw_double_price: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Color Single-Sided</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.color_single_price}
                  onChange={(e) => setForm({ ...form, color_single_price: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Color Double-Sided</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.color_double_price}
                  onChange={(e) => setForm({ ...form, color_double_price: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 text-sm"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 shadow transition"
          >
            <Printer className="w-4 h-4" />
            {loading ? "Generating Shop QR..." : "Create Shop & Generate QR"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}