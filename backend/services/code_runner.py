import httpx

WANDBOX_URL = "https://wandbox.org/api/compile.json"

# Wandbox compiler names
COMPILER_MAP = {
    "python":     "cpython-3.12.0",
    "javascript": "nodejs-20.11.0",
    "typescript": "typescript-5.4.5",
    "java":       "openjdk-head",
    "cpp":        "gcc-head",
    "go":         "go-head",
    "rust":       "rust-head",
}

# Wandbox compiler options per language
COMPILER_OPTIONS = {
    "cpp": "c++17,warning",
}


async def execute_code(language: str, code: str, stdin: str = "") -> dict:
    """Execute code via Wandbox API (free, no auth required)."""
    compiler = COMPILER_MAP.get(language)
    if not compiler:
        return {
            "stdout": "",
            "stderr": f"Unsupported language: {language}",
            "exit_code": 1,
            "error": None,
        }

    payload: dict = {
        "compiler": compiler,
        "code": code,
        "stdin": stdin,
    }
    if language in COMPILER_OPTIONS:
        payload["options"] = COMPILER_OPTIONS[language]

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            r = await client.post(WANDBOX_URL, json=payload)
            r.raise_for_status()
            data = r.json()

            stdout = (data.get("program_output") or "") + (data.get("program_message") or "")
            stderr = (data.get("compiler_error") or "") + (data.get("program_error") or "")
            status = str(data.get("status", "0"))

            return {
                "stdout": stdout[:2000],
                "stderr": stderr[:1000],
                "exit_code": 0 if status == "0" else 1,
                "error": None,
            }
        except httpx.TimeoutException:
            return {
                "stdout": "",
                "stderr": "Execution timed out (20s limit)",
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
