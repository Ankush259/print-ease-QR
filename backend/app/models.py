import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from .database import Base

class Shop(Base):
    __tablename__ = "shops"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    shop_name = Column(String(100), nullable=False)
    owner_email = Column(String(100), unique=True, nullable=False, index=True)
    upi_id = Column(String(100), nullable=False)
    qr_code_path = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    pricing = relationship("ShopPricing", back_populates="shop", uselist=False, cascade="all, delete-orphan")
    jobs = relationship("PrintJob", back_populates="shop", cascade="all, delete-orphan")


class ShopPricing(Base):
    __tablename__ = "shop_pricing"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    shop_id = Column(String(36), ForeignKey("shops.id"), unique=True, nullable=False)
    bw_single_price = Column(Float, default=2.0)
    bw_double_price = Column(Float, default=3.0)
    color_single_price = Column(Float, default=10.0)
    color_double_price = Column(Float, default=15.0)

    shop = relationship("Shop", back_populates="pricing")


class PrintJob(Base):
    __tablename__ = "print_jobs"

    job_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    shop_id = Column(String(36), ForeignKey("shops.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(255), nullable=False)
    total_pages = Column(Integer, nullable=False)
    page_range = Column(String(50), default="ALL")
    copies = Column(Integer, default=1)
    color_mode = Column(String(20), default="BW")       # BW or COLOR
    sides = Column(String(20), default="SINGLE")        # SINGLE or DOUBLE
    paper_size = Column(String(20), default="A4")
    calculated_amount = Column(Float, nullable=False)
    payment_status = Column(String(20), default="PENDING")  # PENDING, PAID, FAILED
    print_status = Column(String(20), default="QUEUED")     # QUEUED, PRINTING, COMPLETED
    created_at = Column(DateTime, default=datetime.utcnow)

    shop = relationship("Shop", back_populates="jobs")