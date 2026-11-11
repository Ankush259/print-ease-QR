from pydantic import BaseModel
from typing import Optional

class ShopPricingBase(BaseModel):
    bw_single_price: float = 2.0
    bw_double_price: float = 3.0
    color_single_price: float = 10.0
    color_double_price: float = 15.0

class ShopCreate(BaseModel):
    shop_name: str
    owner_email: str
    upi_id: str
    pricing: ShopPricingBase

class ShopPricingResponse(ShopPricingBase):
    class Config:
        from_attributes = True

class ShopResponse(BaseModel):
    id: str
    shop_name: str
    owner_email: str
    upi_id: str
    qr_code_path: Optional[str]
    is_active: bool
    pricing: Optional[ShopPricingResponse]

    class Config:
        from_attributes = True