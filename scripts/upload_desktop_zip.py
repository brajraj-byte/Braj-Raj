import sys
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

import storage_utils  # noqa: E402

ZIP_PATH = "/app/desktop/release/CareerBuddha360Suite-Windows.zip"
OBJECT_PATH = "desktop/CareerBuddha360Suite-Windows.zip"

with open(ZIP_PATH, "rb") as f:
    data = f.read()

print("read bytes:", len(data))
res = storage_utils.put_object(OBJECT_PATH, data, "application/zip")
print("upload result:", res)
