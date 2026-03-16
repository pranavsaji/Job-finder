from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, JSON
from sqlalchemy.sql import func
from backend.models.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=True)
    company = Column(String(500), nullable=True)
    poster_name = Column(String(500), nullable=True)
    poster_title = Column(String(500), nullable=True)
    poster_profile_url = Column(String(2000), nullable=True)
    poster_linkedin = Column(String(2000), nullable=True)
    post_url = Column(String(2000), nullable=False)
    platform = Column(String(50), nullable=False)  # linkedin, twitter, reddit, hn
    post_content = Column(Text, nullable=True)
    posted_at = Column(DateTime, nullable=True)
    scraped_at = Column(DateTime, server_default=func.now())
    location = Column(String(500), nullable=True)
    job_type = Column(String(100), nullable=True)  # full-time, contract, part-time
    is_remote = Column(Boolean, default=False)
    tags = Column(JSON, default=list)
    status = Column(String(50), default="new")  # new, saved, applied, archived
    matched_role = Column(String(500), nullable=True)
    salary_range = Column(String(200), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "company": self.company,
            "poster_name": self.poster_name,
            "poster_title": self.poster_title,
            "poster_profile_url": self.poster_profile_url,
            "poster_linkedin": self.poster_linkedin,
            "post_url": self.post_url,
            "platform": self.platform,
            "post_content": self.post_content,
            "posted_at": self.posted_at.isoformat() if self.posted_at else None,
            "scraped_at": self.scraped_at.isoformat() if self.scraped_at else None,
            "location": self.location,
            "job_type": self.job_type,
            "is_remote": self.is_remote,
            "tags": self.tags or [],
            "status": self.status,
            "matched_role": self.matched_role,
            "salary_range": self.salary_range,
        }
