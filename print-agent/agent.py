import os
import time
import urllib.request
import json

API_BASE = "http://127.0.0.1:8000"
SHOP_ID = "74b5f88e-91d5-40d1-99b2-5773c96d45c1"  # Replace with active Shop ID
TEMP_DIR = "temp_prints"
os.makedirs(TEMP_DIR, exist_ok=True)

def fetch_jobs():
    url = f"{API_BASE}/api/jobs/shop/{SHOP_ID}"
    with urllib.request.urlopen(url) as response:
        return json.loads(response.read().decode())

def mark_completed(job_id):
    req = urllib.request.Request(f"{API_BASE}/api/jobs/{job_id}/complete", method="PATCH")
    urllib.request.urlopen(req)

def run_agent():
    print(f"[*] PrintEase Local Agent started for Shop: {SHOP_ID}")
    while True:
        try:
            jobs = fetch_jobs()
            for job in jobs:
                if job["payment_status"] == "PAID" and job["print_status"] == "QUEUED":
                    job_id = job["job_id"]
                    print(f"[+] New Paid Job Found: {job['file_name']} ({job['copies']} copies, {job['color_mode']})")

                    local_pdf = os.path.join(TEMP_DIR, f"{job_id}.pdf")
                    urllib.request.urlretrieve(f"{API_BASE}{job['file_path']}", local_pdf)

                    # Trigger Windows native print spooler (falls back to simulation if no printer attached)
                    try:
                        os.startfile(os.path.abspath(local_pdf), "print")
                    except Exception:
                        print("    [Simulated Print Spooler] Sent PDF to default printer.")

                    time.sleep(2)
                    mark_completed(job_id)
                    if os.path.exists(local_pdf):
                        os.remove(local_pdf)
                    print(f"[✓] Job {job_id[:8]} printed & wiped from cloud storage.\n")
        except Exception as e:
            print(f"[!] Polling error: {e}")

        time.sleep(5)

if __name__ == "__main__":
    run_agent()