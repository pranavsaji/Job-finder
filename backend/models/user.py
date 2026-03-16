from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.sql import func
from backend.models.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(500), nullable=False, unique=True, index=True)
    hashed_password = Column(String(500), nullable=False)
    name = Column(String(500), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    target_roles = Column(JSON, default=list)
    resume_text = Column(Text, nullable=True)
    resume_filename = Column(String(500), nullable=True)
    hunter_api_key = Column(String(500), nullable=True)
    scraping_preferences = Column(JSON, default=dict)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "target_roles": self.target_roles or [],
            "resume_filename": self.resume_filename,
            "has_resume": self.resume_text is not None,
        }
