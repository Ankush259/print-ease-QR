import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Upload, CheckCircle2, Printer, CreditCard, Files } from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

export default function CustomerPortal() {
  const { shopId } = useParams();
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Customization State
  const [colorMode, setColorMode] = useState("BW");
  const [sides, setSides] = useState("SINGLE");
  const [copies, setCopies] = useState(1);
  const [pageRange, setPageRange] = useState("ALL");
  const [paperSize, setPaperSize] = useState("A4");

  // Checkout / Job State
  const [createdJob, setCreatedJob] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    axios
      .get(`${API_BASE}/api/shops/${shopId}`)
      .then((res) => {
        setShop(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [shopId]);

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setFiles(selected);
    setCreatedJob(null);

    const firstImg = selected.find((f) => f.type.startsWith("image/"));
    if (firstImg) {
      setPreviewUrl(URL.createObjectURL(firstImg));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleUploadAndCalculate = async (e) => {
    e.preventDefault();
    if (files.length === 0) return;
    setSubmitting(true);

    const formData = new FormData();
    formData.append("shop_id", shopId);
    formData.append("color_mode", colorMode);
    formData.append("sides", sides);
    formData.append("copies", copies);
    formData.append("page_range", pageRange);
    formData.append("paper_size", paperSize);
    files.forEach((f) => formData.append("files", f));

    try {
      const res = await axios.post(`${API_BASE}/api/jobs/upload`, formData);
      setCreatedJob(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayNow = async () => {
    if (!createdJob) return;
    try {
      const { data: order } = await axios.post(
        `${API_BASE}/api/jobs/${createdJob.job_id}/create-order`
      );

      if (order.demo_mode) {
        const res = await axios.post(
          `${API_BASE}/api/jobs/${createdJob.job_id}/verify-payment`,
          {
            razorpay_order_id: order.order_id,
            razorpay_payment_id: `pay_demo_${Date.now()}`,
            razorpay_signature: "demo_signature_verified",
          }
        );
        setCreatedJob(res.data);
        return;
      }

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: shop.shop_name,
        description: `Print Job (${createdJob.total_pages} pages, ${createdJob.color_mode})`,
        order_id: order.order_id,
        prefill: {
          name: "Walk-in Customer",
          email: "customer@printease.local",
          contact: "9876543210",
        },
        handler: async function (response) {
          const verifyRes = await axios.post(
            `${API_BASE}/api/jobs/${createdJob.job_id}/verify-payment`,
            {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }
          );
          setCreatedJob(verifyRes.data);
        },
        theme: { color: "#4f46e5" },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      alert(err.response?.data?.detail || "Payment gateway initialization failed");
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-600">Loading shop portal...</div>;
  if (!shop) return <div className="p-8 text-center text-red-600 font-semibold">Invalid Shop QR Code</div>;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 flex justify-center">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 space-y-6">
        {/* Shop Header */}
        <div className="border-b pb-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Self-Service Print</span>
            <h1 className="text-xl font-bold text-slate-900">{shop.shop_name}</h1>
          </div>
          <Printer className="w-8 h-8 text-indigo-600" />
        </div>

        {/* Rate Card Pill */}
        <div className="bg-indigo-50 rounded-xl p-3 text-xs text-indigo-950 grid grid-cols-2 gap-2">
          <div>B&W Single: <b>₹{shop.pricing.bw_single_price}/pg</b></div>
          <div>B&W Double: <b>₹{shop.pricing.bw_double_price}/sheet</b></div>
          <div>Color Single: <b>₹{shop.pricing.color_single_price}/pg</b></div>
          <div>Color Double: <b>₹{shop.pricing.color_double_price}/sheet</b></div>
        </div>

        {/* Step 1: Multi-File Upload */}
        <form onSubmit={handleUploadAndCalculate} className="space-y-5">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-300 rounded-xl p-6 cursor-pointer hover:bg-indigo-50/40 transition text-center">
            <Upload className="w-8 h-8 text-indigo-500 mb-2" />
            <span className="text-sm font-medium text-slate-700">
              {files.length === 0
                ? "Tap to attach 1 or more PDFs, JPGs, or PNGs"
                : `${files.length} file(s) attached (Auto-Merged)`}
            </span>
            <span className="text-[11px] text-slate-400 mt-1">
              Multiple files are merged automatically into one print job
            </span>
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {/* Attached File List */}
          {files.length > 0 && (
            <div className="bg-slate-50 border rounded-xl p-3 space-y-1">
              <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                <Files className="w-3.5 h-3.5 text-indigo-600" /> Attached Documents:
              </p>
              {files.map((f, idx) => (
                <div key={idx} className="text-xs text-slate-700 truncate">
                  {idx + 1}. {f.name}
                </div>
              ))}
            </div>
          )}

          {/* Live Image Preview with B&W Filter */}
          {previewUrl && (
            <div className="border rounded-xl p-3 bg-slate-100 text-center">
              <p className="text-xs text-slate-500 mb-2">Live Print Mode Preview ({colorMode})</p>
              <img
                src={previewUrl}
                alt="Preview"
                className={`max-h-48 mx-auto rounded shadow ${colorMode === "BW" ? "grayscale" : ""}`}
              />
            </div>
          )}

          {/* Step 2: Customization Options */}
          {files.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Color Mode</label>
                  <select
                    value={colorMode}
                    onChange={(e) => setColorMode(e.target.value)}
                    className="w-full mt-1 border rounded-lg p-2.5 text-sm bg-white"
                  >
                    <option value="BW">Black & White</option>
                    <option value="COLOR">Full Color</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Sides</label>
                  <select
                    value={sides}
                    onChange={(e) => setSides(e.target.value)}
                    className="w-full mt-1 border rounded-lg p-2.5 text-sm bg-white"
                  >
                    <option value="SINGLE">Single-Sided</option>
                    <option value="DOUBLE">Double-Sided (Duplex)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Copies</label>
                  <input
                    type="number"
                    min="1"
                    value={copies}
                    onChange={(e) => setCopies(Number(e.target.value))}
                    className="w-full mt-1 border rounded-lg p-2 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Page Range</label>
                  <input
                    type="text"
                    placeholder="ALL or 1-3"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    className="w-full mt-1 border rounded-lg p-2 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Paper Size</label>
                  <select
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value)}
                    className="w-full mt-1 border rounded-lg p-2 text-sm bg-white"
                  >
                    <option value="A4">A4</option>
                    <option value="A3">A3</option>
                    <option value="LEGAL">Legal</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl shadow transition"
              >
                {submitting ? "Merging & Calculating Cost..." : "Calculate Exact Price"}
              </button>
            </div>
          )}
        </form>

        {/* Step 3: Bill Summary & Payment Checkout */}
        {createdJob && (
          <div className="border-t pt-4 space-y-4">
            <div className="bg-slate-100 p-4 rounded-xl space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Detected Pages to Print:</span>
                <span className="font-semibold">{createdJob.total_pages} pages</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Copies & Mode:</span>
                <span className="font-semibold">{createdJob.copies}x ({createdJob.color_mode}, {createdJob.sides})</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t">
                <span>Total Payable:</span>
                <span className="text-indigo-600">₹{createdJob.calculated_amount}</span>
              </div>
            </div>

            {createdJob.payment_status !== "PAID" ? (
              <button
                onClick={handlePayNow}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 shadow transition"
              >
                <CreditCard className="w-5 h-5" />
                Pay ₹{createdJob.calculated_amount} via UPI / Gateway
              </button>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div className="text-xs">
                  <p className="font-bold text-sm">Payment Successful!</p>
                  <p>Your document is now in the shop's print queue (Job ID: {createdJob.job_id.slice(0, 8)}).</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}