import { BrowserRouter, Routes, Route } from "react-router-dom";
import CustomerPortal from "./pages/CustomerPortal";
import ShopDashboard from "./pages/ShopDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/shop/:shopId" element={<CustomerPortal />} />
        <Route path="/dashboard/:shopId" element={<ShopDashboard />} />
        <Route path="*" element={<div className="p-8 text-center">Scan a valid Shop QR Code to begin.</div>} />
      </Routes>
    </BrowserRouter>
  );
}