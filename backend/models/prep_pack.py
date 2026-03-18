from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.sql import func
from backend.models.database import Base


class PrepPackRecord(Base):
    __tablename__ = "prep_packs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    company = Column(String(200), nullable=False)
    role = Column(String(200), nullable=False)
    job_description = Column(Text, nullable=True)
    pack = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "company": self.company,
            "role": self.role,
            "job_description": self.job_description,
            "pack": self.pack,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
