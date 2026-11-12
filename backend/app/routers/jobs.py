import os
import uuid
import hmac
import hashlib
import json
import base64
import urllib.request
from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pypdf import PdfReader, PdfWriter
from PIL import Image
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/jobs", tags=["Print Jobs"])

DOCS_DIR = "uploads/documents"
os.makedirs(DOCS_DIR, exist_ok=True)


# --- Real-Time WebSocket Connection Manager ---
class ShopConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, shop_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(shop_id, []).append(websocket)

    def disconnect(self, shop_id: str, websocket: WebSocket):
        if shop_id in self.active_connections:
            if websocket in self.active_connections[shop_id]:
                self.active_connections[shop_id].remove(websocket)

    async def broadcast(self, shop_id: str, event_type: str, job_id: str):
        for ws in list(self.active_connections.get(shop_id, [])):
            try:
                await ws.send_json({"event": event_type, "job_id": job_id})
            except Exception:
                self.disconnect(shop_id, ws)


ws_manager = ShopConnectionManager()


@router.websocket("/ws/{shop_id}")
async def shop_queue_websocket(websocket: WebSocket, shop_id: str):
    """Persistent WebSocket channel for real-time shopkeeper queue updates."""
    await ws_manager.connect(shop_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(shop_id, websocket)


def slice_pdf_pages(disk_path: str, page_range_str: str) -> int:
    """
    Validates page_range_str (e.g. 'ALL' or '1-3, 5'), physically slices the PDF
    on disk so only those pages remain for printing, and returns the page count.
    """
    with open(disk_path, "rb") as in_file:
        reader = PdfReader(in_file)
        max_pages = len(reader.pages)

        cleaned = page_range_str.strip().upper()
        if not cleaned or cleaned == "ALL":
            return max_pages

        selected_pages = []
        seen = set()
        try:
            parts = cleaned.split(",")
            for part in parts:
                part = part.strip()
                if "-" in part:
                    start, end = map(int, part.split("-"))
                    if start < 1 or end > max_pages or start > end:
                        raise ValueError
                    for p in range(start, end + 1):
                        if p not in seen:
                            seen.add(p)
                            selected_pages.append(p)
                else:
                    page = int(part)
                    if page < 1 or page > max_pages:
                        raise ValueError
                    if page not in seen:
                        seen.add(page)
                        selected_pages.append(page)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid page range '{page_range_str}'. Document has {max_pages} pages."
            )

        writer = PdfWriter()
        for page_num in selected_pages:
            writer.add_page(reader.pages[page_num - 1])

    with open(disk_path, "wb") as out_file:
        writer.write(out_file)

    return len(selected_pages)


def calculate_print_cost(
    pages_to_print: int,
    copies: int,
    color_mode: str,
    sides: str,
    pricing: models.ShopPricing
) -> float:
    color_mode = color_mode.upper()
    sides = sides.upper()

    if sides == "SINGLE":
        rate = pricing.color_single_price if color_mode == "COLOR" else pricing.bw_single_price
        cost_per_copy = pages_to_print * rate
    elif sides == "DOUBLE":
        double_sheets = pages_to_print // 2
        rem_single_page = pages_to_print % 2
        if color_mode == "COLOR":
            cost_per_copy = (double_sheets * pricing.color_double_price) + (rem_single_page * pricing.color_single_price)
        else:
            cost_per_copy = (double_sheets * pricing.bw_double_price) + (rem_single_page * pricing.bw_single_price)
    else:
        raise HTTPException(status_code=400, detail="sides must be SINGLE or DOUBLE")

    return round(cost_per_copy * copies, 2)


@router.post("/upload", response_model=schemas.PrintJobResponse)
async def create_print_job(
    shop_id: str = Form(...),
    color_mode: str = Form("BW"),
    sides: str = Form("SINGLE"),
    copies: int = Form(1),
    page_range: str = Form("ALL"),
    paper_size: str = Form("A4"),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    shop = db.query(models.Shop).filter(models.Shop.id == shop_id, models.Shop.is_active == True).first()
    if not shop or not shop.pricing:
        raise HTTPException(status_code=404, detail="Shop or shop pricing not found.")

    if not files:
        raise HTTPException(status_code=400, detail="Please attach at least one file.")

    unique_id = str(uuid.uuid4())
    saved_filename = f"{unique_id}.pdf"
    disk_path = os.path.join(DOCS_DIR, saved_filename)

    merger = PdfWriter()
    temp_files = []

    try:
        for idx, upload in enumerate(files):
            ext = os.path.splitext(upload.filename)[1].lower()
            if ext not in [".pdf", ".png", ".jpg", ".jpeg"]:
                raise HTTPException(status_code=400, detail=f"Unsupported file: {upload.filename}")

            part_path = os.path.join(DOCS_DIR, f"{unique_id}_part{idx}.pdf")
            temp_files.append(part_path)

            if ext == ".pdf":
                with open(part_path, "wb") as f:
                    f.write(await upload.read())
            else:
                raw_img_path = os.path.join(DOCS_DIR, f"{unique_id}_img{idx}{ext}")
                temp_files.append(raw_img_path)
                with open(raw_img_path, "wb") as f:
                    f.write(await upload.read())
                img = Image.open(raw_img_path).convert("RGB")
                img.save(part_path, "PDF", resolution=100.0)

            with open(part_path, "rb") as pdf_in:
                reader = PdfReader(pdf_in)
                for page in reader.pages:
                    merger.add_page(page)

        with open(disk_path, "wb") as merged_out:
            merger.write(merged_out)

        pages_to_print = slice_pdf_pages(disk_path, page_range)
    except HTTPException:
        if os.path.exists(disk_path):
            os.remove(disk_path)
        raise
    except Exception as e:
        if os.path.exists(disk_path):
            os.remove(disk_path)
        raise HTTPException(status_code=400, detail=f"Document merge error: {str(e)}")
    finally:
        for t_path in temp_files:
            if os.path.exists(t_path):
                os.remove(t_path)

    total_amount = calculate_print_cost(
        pages_to_print=pages_to_print,
        copies=copies,
        color_mode=color_mode,
        sides=sides,
        pricing=shop.pricing
    )

    display_name = (
        files[0].filename
        if len(files) == 1
        else f"{files[0].filename} (+{len(files) - 1} merged)"
    )

    new_job = models.PrintJob(
        job_id=unique_id,
        shop_id=shop_id,
        file_name=display_name,
        file_path=f"/static/documents/{saved_filename}",
        total_pages=pages_to_print,
        page_range=page_range.upper(),
        copies=copies,
        color_mode=color_mode.upper(),
        sides=sides.upper(),
        paper_size=paper_size.upper(),
        calculated_amount=total_amount,
        payment_status="PENDING",
        print_status="QUEUED"
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    await ws_manager.broadcast(shop_id, "NEW_JOB", new_job.job_id)
    return new_job


@router.get("/shop/{shop_id}", response_model=List[schemas.PrintJobResponse])
def get_shop_print_queue(shop_id: str, db: Session = Depends(get_db)):
    jobs = (
        db.query(models.PrintJob)
        .filter(models.PrintJob.shop_id == shop_id)
        .order_by(models.PrintJob.created_at.desc())
        .all()
    )
    return jobs


@router.patch("/{job_id}/pay", response_model=schemas.PrintJobResponse)
async def mark_job_as_paid(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.PrintJob).filter(models.PrintJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found.")
    job.payment_status = "PAID"
    db.commit()
    db.refresh(job)
    await ws_manager.broadcast(job.shop_id, "JOB_PAID", job.job_id)
    return job


@router.post("/{job_id}/create-order", response_model=schemas.RazorpayOrderResponse)
def create_razorpay_order(job_id: str, db: Session = Depends(get_db)):
    """Creates a Razorpay Order in paise (or a Demo Order if test keys aren't set)."""
    job = db.query(models.PrintJob).filter(models.PrintJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found.")

    amount_paise = int(round(job.calculated_amount * 100))
    key_id = os.getenv("RAZORPAY_KEY_ID", "rzp_test_your_key_here")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "your_secret_here")

    if key_id == "rzp_test_your_key_here" or not key_secret:
        return {
            "order_id": f"order_demo_{job.job_id[:8]}",
            "amount": amount_paise,
            "currency": "INR",
            "key_id": "demo_key",
            "demo_mode": True
        }

    payload = json.dumps({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": f"rcpt_{job.job_id[:8]}"
    }).encode("utf-8")

    credentials = f"{key_id}:{key_secret}"
    encoded_creds = base64.b64encode(credentials.encode("utf-8")).decode("utf-8")

    req = urllib.request.Request(
        "https://api.razorpay.com/v1/orders",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {encoded_creds}"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            order_data = json.loads(resp.read().decode("utf-8"))
            return {
                "order_id": order_data["id"],
                "amount": order_data["amount"],
                "currency": order_data["currency"],
                "key_id": key_id,
                "demo_mode": False
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Razorpay Order creation failed: {str(e)}")


@router.post("/{job_id}/verify-payment", response_model=schemas.PrintJobResponse)
async def verify_razorpay_payment(
    job_id: str,
    payment: schemas.PaymentVerifyRequest,
    db: Session = Depends(get_db)
):
    """Verifies HMAC-SHA256 signature from Razorpay Checkout and marks job PAID."""
    job = db.query(models.PrintJob).filter(models.PrintJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found.")

    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "your_secret_here")

    if not payment.razorpay_order_id.startswith("order_demo_"):
        msg = f"{payment.razorpay_order_id}|{payment.razorpay_payment_id}".encode("utf-8")
        generated_sig = hmac.new(key_secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(generated_sig, payment.razorpay_signature):
            job.payment_status = "FAILED"
            db.commit()
            raise HTTPException(status_code=400, detail="Invalid Razorpay payment signature.")

    job.payment_status = "PAID"
    db.commit()
    db.refresh(job)

    # Trigger instant WebSocket push + audio chime on Shopkeeper Dashboard
    await ws_manager.broadcast(job.shop_id, "JOB_PAID", job.job_id)
    return job


@router.patch("/{job_id}/complete", response_model=schemas.PrintJobResponse)
async def mark_job_as_completed(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.PrintJob).filter(models.PrintJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found.")

    filename = os.path.basename(job.file_path)
    disk_path = os.path.join(DOCS_DIR, filename)
    if os.path.exists(disk_path):
        os.remove(disk_path)

    job.print_status = "COMPLETED"
    db.commit()
    db.refresh(job)
    await ws_manager.broadcast(job.shop_id, "JOB_COMPLETED", job.job_id)
    return job