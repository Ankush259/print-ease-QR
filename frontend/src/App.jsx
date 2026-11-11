import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomeRegister from "./pages/HomeRegister";
import CustomerPortal from "./pages/CustomerPortal";
import ShopDashboard from "./pages/ShopDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRegister />} />
        <Route path="/shop/:shopId" element={<CustomerPortal />} />
        <Route path="/dashboard/:shopId" element={<ShopDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}