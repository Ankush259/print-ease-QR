import os
import time
import tempfile
import requests

API_BASE = "http://127.0.0.1:8000"
SHOP_ID = "74b5f88e-91d5-40d1-99b2-5773c96d45c1"


def spool_to_windows_printer(pdf_url: str, copies: int):
    """Downloads the sliced PDF into a temp file and spools it to the default Windows printer."""
    resp = requests.get(pdf_url, timeout=15)
    resp.raise_for_status()

    temp_pdf = os.path.join(tempfile.gettempdir(), f"printease_{int(time.time())}.pdf")
    with open(temp_pdf, "wb") as f:
        f.write(resp.content)

    for copy_num in range(copies):
        print(f"  -> Sending copy {copy_num + 1}/{copies} to Windows Print Spooler...")
        if os.name == "nt":
            os.startfile(temp_pdf, "print")

    time.sleep(5)
    if os.path.exists(temp_pdf):
        os.remove(temp_pdf)


def run_zero_click_agent():
    print(f"=== PrintEase Zero-Click Hardware Agent Active (Shop: {SHOP_ID[:8]}) ===")
    print("Listening for PAID jobs... Owner intervention required: ZERO.\n")

    while True:
        try:
            res = requests.get(f"{API_BASE}/api/jobs/shop/{SHOP_ID}", timeout=10)
            if res.status_code == 200:
                jobs = res.json()
                for job in jobs:
                    if job["payment_status"] == "PAID" and job["print_status"] == "QUEUED":
                        print(f"[NEW PAID JOB] #{job['job_id'][:6].upper()} | {job['file_name']} ({job['total_pages']} pgs)")
                        pdf_url = f"{API_BASE}{job['file_path']}"
                        spool_to_windows_printer(pdf_url, job["copies"])

                        # Tell server to wipe file and mark COMPLETED
                        requests.patch(f"{API_BASE}/api/jobs/{job['job_id']}/complete", timeout=10)
                        print(f"[COMPLETED & WIPED] Hand printout to customer #{job['job_id'][:6].upper()}!\n")
        except Exception as e:
            print(f"[Agent Connection Retry] {e}")

        time.sleep(2)


if __name__ == "__main__":
    run_zero_click_agent()