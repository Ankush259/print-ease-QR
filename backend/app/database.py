import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# 1. Read the .env file from the backend/ folder
load_dotenv()

# 2. Grab the XAMPP MySQL connection URL from .env
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://root:@localhost:3306/print_ease_db")

# 3. Create the actual connection pipe to MySQL
engine = create_engine(DATABASE_URL)

# 4. Create a factory that generates temporary DB workspaces (sessions)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 5. Create the parent class that all database tables (models.py) will use
Base = declarative_base()

# 6. Helper function used by API routes to open & close DB connections safely
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()