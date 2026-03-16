import io
from typing import Optional


async def parse_resume(file_content: bytes, filename: str) -> dict:
    """Parse resume from PDF or DOCX and return structured text."""
    text = ""
    ext = filename.lower().split(".")[-1] if "." in filename else ""

    if ext == "pdf":
        text = _parse_pdf(file_content)
    elif ext in ("docx", "doc"):
        text = _parse_docx(file_content)
    else:
        text = file_content.decode("utf-8", errors="ignore")

    structured = _extract_structure(text)
    return {
        "raw_text": text,
        "name": structured.get("name"),
        "skills": structured.get("skills", []),
        "experience": structured.get("experience", []),
        "education": structured.get("education", []),
        "summary": text[:1000] if text else "",
    }


def _parse_pdf(content: bytes) -> str:
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(content))
        pages = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        return "\n".join(pages)
    except Exception as e:
        return f"PDF parse error: {str(e)}"


def _parse_docx(content: bytes) -> str:
    try:
        import docx
        doc = docx.Document(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs)
    except Exception as e:
        return f"DOCX parse error: {str(e)}"


def _extract_structure(text: str) -> dict:
    """Basic structured extraction from resume text."""
    lines = text.split("\n")
    result = {"name": None, "skills": [], "experience": [], "education": []}

    if lines:
        first_non_empty = next((l.strip() for l in lines[:5] if l.strip()), None)
        if first_non_empty and len(first_non_empty.split()) <= 5:
            result["name"] = first_non_empty

    skill_keywords = [
        "python", "javascript", "typescript", "react", "node", "java", "go", "rust",
        "sql", "postgresql", "mysql", "mongodb", "redis", "aws", "gcp", "azure",
        "docker", "kubernetes", "fastapi", "django", "flask", "next.js", "vue",
        "machine learning", "deep learning", "nlp", "pytorch", "tensorflow",
        "git", "ci/cd", "agile", "scrum", "graphql", "rest", "api",
    ]

    text_lower = text.lower()
    found_skills = [skill for skill in skill_keywords if skill in text_lower]
    result["skills"] = found_skills

    in_experience = False
    in_education = False
    current_section = []

    section_headers = {
        "experience": ["experience", "work history", "employment", "career"],
        "education": ["education", "academic", "degree", "university", "college"],
        "skills": ["skills", "technical skills", "competencies", "technologies"],
    }

    for line in lines:
        line_lower = line.lower().strip()
        is_header = False

        for section, keywords in section_headers.items():
            if any(kw in line_lower for kw in keywords) and len(line_lower) < 50:
                if current_section and in_experience:
                    result["experience"].append(" ".join(current_section[:3]))
                if current_section and in_education:
                    result["education"].append(" ".join(current_section[:3]))
                current_section = []
                in_experience = section == "experience"
                in_education = section == "education"
                is_header = True
                break

        if not is_header and line.strip():
            current_section.append(line.strip())

    return result
