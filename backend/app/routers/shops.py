
import hmac
import hashlib
import base64
from fastapi import Header
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

SECRET_KEY = os.getenv("JWT_SECRET", "printease-super-secret-jwt-key-2026")
DEFAULT_SHOP_PIN = os.getenv("SHOP_ADMIN_PIN", "1234")


def create_shop_token(shop_id: str) -> str:
    sig = hmac.new(SECRET_KEY.encode(), shop_id.encode(), hashlib.sha256).hexdigest()
    raw = f"{shop_id}.{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def verify_shop_token(shop_id: str, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token.")
    token = authorization.split(" ")[1]
    expected = create_shop_token(shop_id)
    if not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=403, detail="Unauthorized access to this shop.")


@router.post("/{shop_id}/login", response_model=schemas.ShopAuthResponse)
def login_shop_owner(shop_id: str, body: schemas.ShopLoginRequest, db: Session = Depends(get_db)):
    """Verifies shopkeeper PIN/password (default: 1234) and returns a signed token."""
    shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")

    if body.password != DEFAULT_SHOP_PIN:
        raise HTTPException(status_code=401, detail="Invalid Shop PIN / Password (default is 1234).")

    return {"token": create_shop_token(shop_id), "shop_id": shop_id}


@router.put("/{shop_id}/pricing", response_model=schemas.ShopResponse)
def update_shop_pricing(
    shop_id: str,
    pricing_in: schemas.ShopPricingUpdate,
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """Protected endpoint allowing authenticated shopkeepers to update per-page rates live."""
    verify_shop_token(shop_id, authorization)

    shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not shop or not shop.pricing:
        raise HTTPException(status_code=404, detail="Shop or pricing not found.")

    shop.pricing.bw_single_price = pricing_in.bw_single_price
    shop.pricing.bw_double_price = pricing_in.bw_double_price
    shop.pricing.color_single_price = pricing_in.color_single_price
    shop.pricing.color_double_price = pricing_in.color_double_price

    db.commit()
    db.refresh(shop)
    return shop