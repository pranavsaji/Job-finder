from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.sql import func
from backend.models.database import Base


class Person(Base):
    __tablename__ = "persons"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), nullable=False)
    title = Column(String(500), nullable=True)
    company = Column(String(500), nullable=True)
    linkedin_url = Column(String(2000), nullable=True, unique=True)
    twitter_handle = Column(String(200), nullable=True)
    email = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)
    location = Column(String(500), nullable=True)
    profile_image_url = Column(String(2000), nullable=True)
    skills = Column(JSON, default=list)
    recent_posts = Column(JSON, default=list)
    enriched_at = Column(DateTime, nullable=True)
    job_id = Column(Integer, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "title": self.title,
            "company": self.company,
            "linkedin_url": self.linkedin_url,
            "twitter_handle": self.twitter_handle,
            "email": self.email,
            "bio": self.bio,
            "location": self.location,
            "profile_image_url": self.profile_image_url,
            "skills": self.skills or [],
            "recent_posts": self.recent_posts or [],
            "enriched_at": self.enriched_at.isoformat() if self.enriched_at else None,
            "job_id": self.job_id,
        }
