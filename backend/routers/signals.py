from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from backend.models.user import User
from backend.middleware.auth import get_current_user

router = APIRouter(prefix="/signals", tags=["signals"])


class CompanySignalRequest(BaseModel):
    company: str
    roles: Optional[List[str]] = None
    country: Optional[str] = None


class ScanSignalsRequest(BaseModel):
    roles: List[str]
    country: Optional[str] = None


def _serialize_signal(s: dict) -> dict:
    """Ensure datetime objects are JSON-serializable."""
    d = dict(s)
    if isinstance(d.get("date"), datetime):
        d["date"] = d["date"].isoformat()
    return d


@router.post("/company")
async def get_company_signals(
    payload: CompanySignalRequest,
    current_user: User = Depends(get_current_user),
):
    """Fetch intelligence signals for a specific company."""
    from backend.services.signals_service import fetch_company_signals
    signals = await fetch_company_signals(payload.company, payload.roles, payload.country)
    return {"company": payload.company, "signals": [_serialize_signal(s) for s in signals]}


@router.post("/scan")
async def scan_for_signals(
    payload: ScanSignalsRequest,
    current_user: User = Depends(get_current_user),
):
    """Broad scan: find companies showing hiring signals for given roles."""
    from backend.services.signals_service import scan_signals_for_roles
    signals = await scan_signals_for_roles(payload.roles, country=payload.country)
    return {"signals": [_serialize_signal(s) for s in signals]}
