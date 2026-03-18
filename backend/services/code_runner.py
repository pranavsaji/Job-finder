import httpx
from typing import Optional

PISTON_URL = "https://emkc.org/api/v2/piston"

LANGUAGE_MAP = {
    "javascript": ("node", "18.15.0"),
    "typescript": ("typescript", "5.0.3"),
    "python": ("python", "3.10.0"),
    "java": ("java", "15.0.2"),
    "cpp": ("c++", "10.2.0"),
    "go": ("go", "1.16.2"),
    "rust": ("rust", "1.50.0"),
}


async def execute_code(language: str, code: str, stdin: str = "") -> dict:
    """Execute code via Piston API. Returns {stdout, stderr, exit_code, error}"""
    lang_info = LANGUAGE_MAP.get(language)
    if not lang_info:
        return {
            "stdout": "",
            "stderr": f"Unsupported language: {language}",
            "exit_code": 1,
            "error": None,
        }

    lang_name, lang_version = lang_info
    payload = {
        "language": lang_name,
        "version": lang_version,
        "files": [{"name": f"main.{language}", "content": code}],
        "stdin": stdin,
        "run_timeout": 5000,    # 5 second timeout
        "compile_timeout": 10000,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.post(f"{PISTON_URL}/execute", json=payload)
            r.raise_for_status()
            data = r.json()
            run = data.get("run", {})
            return {
                "stdout": run.get("stdout", "")[:2000],  # cap output
                "stderr": run.get("stderr", "")[:1000],
                "exit_code": run.get("code", 0),
                "error": None,
            }
        except httpx.TimeoutException:
            return {
                "stdout": "",
                "stderr": "Execution timed out (5s limit)",
                "exit_code": 1,
                "error": "timeout",
            }
        except Exception as e:
            return {
                "stdout": "",
                "stderr": str(e),
                "exit_code": 1,
                "error": str(e),
            }
