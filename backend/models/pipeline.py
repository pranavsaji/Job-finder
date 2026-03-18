from enum import Enum
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.sql import func
from backend.models.database import Base


class ApplicationStage(str, Enum):
    applied = "applied"
    phone_screen = "phone_screen"
    technical = "technical"
    onsite = "onsite"
    offer = "offer"
    rejected = "rejected"
    withdrawn = "withdrawn"


class PipelineEntry(Base):
    __tablename__ = "pipeline_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    job_id = Column(Integer, nullable=True)
    company = Column(String(200), nullable=False)
    role = Column(String(200), nullable=False)
    stage = Column(String(50), default="applied")
    stage_history = Column(JSON, default=list)   # [{stage, ts, note}]
    contacts = Column(JSON, default=list)         # [{name, title, email, linkedin_url, notes}]
    notes = Column(Text, nullable=True)
    follow_up_at = Column(DateTime, nullable=True)
    offer_amount = Column(String(100), nullable=True)
    offer_details = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "job_id": self.job_id,
            "company": self.company,
            "role": self.role,
            "stage": self.stage,
            "stage_history": self.stage_history or [],
            "contacts": self.contacts or [],
            "notes": self.notes,
            "follow_up_at": self.follow_up_at.isoformat() if self.follow_up_at else None,
            "offer_amount": self.offer_amount,
            "offer_details": self.offer_details,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
