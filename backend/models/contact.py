from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from backend.models.database import Base


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    title = Column(String(200), nullable=True)
    company = Column(String(200), nullable=True)
    linkedin_url = Column(String(500), nullable=True)
    email = Column(String(200), nullable=True)
    source = Column(String(50), nullable=True)   # network/manual/job
    status = Column(String(50), default="discovered")  # discovered/messaged/replied/referred/pass
    notes = Column(Text, nullable=True)
    job_id = Column(Integer, nullable=True)
    last_contact_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "title": self.title,
            "company": self.company,
            "linkedin_url": self.linkedin_url,
            "email": self.email,
            "source": self.source,
            "status": self.status,
            "notes": self.notes,
            "job_id": self.job_id,
            "last_contact_at": self.last_contact_at.isoformat() if self.last_contact_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
