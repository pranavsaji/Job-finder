from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from backend.models.database import Base


class ResumeVersion(Base):
    __tablename__ = "resume_versions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    label = Column(String(200), nullable=True)
    resume_text = Column(Text, nullable=False)
    filename = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "label": self.label,
            "filename": self.filename,
            "char_count": len(self.resume_text) if self.resume_text else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resume_text": self.resume_text,
        }
