import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pypdf import PdfReader, PdfWriter
from PIL import Image
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/jobs", tags=["Print Jobs"])

DOCS_DIR = "uploads/documents"
os.makedirs(DOCS_DIR, exist_ok=True)


def slice_pdf_pages(disk_path: str, page_range_str: str) -> int:
    """
    Validates page_range_str (e.g. 'ALL' or '1-3, 5'), physically slices the PDF
    on disk so only those pages remain for printing, and returns the page count.
    """
    reader = PdfReader(disk_path)
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
        os.remove(disk_path)
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
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    shop = db.query(models.Shop).filter(models.Shop.id == shop_id, models.Shop.is_active == True).first()
    if not shop or not shop.pricing:
        raise HTTPException(status_code=404, detail="Shop or shop pricing not found.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf", ".png", ".jpg", ".jpeg"]:
        raise HTTPException(status_code=400, detail="Only PDF, PNG, and JPG files are supported.")

    unique_id = str(uuid.uuid4())
    saved_filename = f"{unique_id}.pdf"
    disk_path = os.path.join(DOCS_DIR, saved_filename)

    if ext == ".pdf":
        with open(disk_path, "wb") as f:
            f.write(await file.read())
        try:
            pages_to_print = slice_pdf_pages(disk_path, page_range)
        except HTTPException:
            raise
        except Exception:
            if os.path.exists(disk_path):
                os.remove(disk_path)
            raise HTTPException(status_code=400, detail="Corrupted or encrypted PDF file.")
    else:
        temp_img_path = os.path.join(DOCS_DIR, f"{unique_id}{ext}")
        with open(temp_img_path, "wb") as f:
            f.write(await file.read())
        try:
            img = Image.open(temp_img_path).convert("RGB")
            img.save(disk_path, "PDF", resolution=100.0)
            os.remove(temp_img_path)
            pages_to_print = 1
        except Exception:
            if os.path.exists(temp_img_path):
                os.remove(temp_img_path)
            raise HTTPException(status_code=400, detail="Invalid image file.")

    total_amount = calculate_print_cost(
        pages_to_print=pages_to_print,
        copies=copies,
        color_mode=color_mode,
        sides=sides,
        pricing=shop.pricing
    )

    new_job = models.PrintJob(
        job_id=unique_id,
        shop_id=shop_id,
        file_name=file.filename,
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
def mark_job_as_paid(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.PrintJob).filter(models.PrintJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found.")
    job.payment_status = "PAID"
    db.commit()
    db.refresh(job)
    return job


@router.patch("/{job_id}/complete", response_model=schemas.PrintJobResponse)
def mark_job_as_completed(job_id: str, db: Session = Depends(get_db)):
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
    return job