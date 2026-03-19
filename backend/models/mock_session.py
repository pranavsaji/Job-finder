from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.sql import func
from backend.models.database import Base


class MockSession(Base):
    __tablename__ = "mock_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    job_id = Column(Integer, nullable=True)
    company = Column(String(200), nullable=False)
    role = Column(String(200), nullable=False)
    interview_type = Column(String(50), nullable=False)
    difficulty = Column(String(20), nullable=False, default="medium")
    duration_minutes = Column(Integer, default=45)   # user-chosen interview length
    job_description = Column(Text, nullable=True)
    resume_snapshot = Column(Text, nullable=True)
    research_context = Column(Text, nullable=True)
    current_code = Column(Text, nullable=True)       # auto-saved code (unsent)
    messages = Column(JSON, default=list)   # [{role, content, ts}]
    evaluation = Column(JSON, nullable=True)
    speech_metrics = Column(JSON, nullable=True)
    cheat_flags = Column(JSON, nullable=True)
    status = Column(String(20), default="active")  # active | completed | abandoned
    started_at = Column(DateTime, server_default=func.now())
    ended_at = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "company": self.company,
            "role": self.role,
            "interview_type": self.interview_type,
            "difficulty": self.difficulty,
            "duration_minutes": self.duration_minutes or 45,
            "job_description": self.job_description,
            "current_code": self.current_code,
            "messages": self.messages or [],
            "evaluation": self.evaluation,
            "speech_metrics": self.speech_metrics,
            "cheat_flags": self.cheat_flags,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
        }
