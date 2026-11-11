import os
import qrcode
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/shops", tags=["Shops"])

QR_DIR = "uploads/qrcodes"
os.makedirs(QR_DIR, exist_ok=True)

@router.post("/", response_model=schemas.ShopResponse)
def register_shop(shop_data: schemas.ShopCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Shop).filter(models.Shop.owner_email == shop_data.owner_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered for a shop.")

    new_shop = models.Shop(
        shop_name=shop_data.shop_name,
        owner_email=shop_data.owner_email,
        upi_id=shop_data.upi_id
    )
    db.add(new_shop)
    db.flush()  # Generates the UUID for new_shop.id before committing

    pricing = models.ShopPricing(
        shop_id=new_shop.id,
        **shop_data.pricing.model_dump()
    )
    db.add(pricing)

    # Build the unique customer URL and generate QR code image
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    customer_portal_url = f"{frontend_url}/shop/{new_shop.id}"

    qr_filename = f"{new_shop.id}.png"
    qr_filepath = os.path.join(QR_DIR, qr_filename)

    qr_img = qrcode.make(customer_portal_url)
    qr_img.save(qr_filepath)

    new_shop.qr_code_path = f"/static/qrcodes/{qr_filename}"
    db.commit()
    db.refresh(new_shop)
    return new_shop


@router.get("/{shop_id}", response_model=schemas.ShopResponse)
def get_shop_details(shop_id: str, db: Session = Depends(get_db)):
    shop = db.query(models.Shop).filter(models.Shop.id == shop_id, models.Shop.is_active == True).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found or inactive.")
    return shop