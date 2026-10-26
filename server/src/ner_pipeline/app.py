from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import AliasChoices, BaseModel, Field

from .event_module import detect_triggers
from .pipeline import LegalExtractionPipeline

app = FastAPI(
    title="Vietnamese Legal Entity and Event Extraction API",
    description="NLP API for Vietnamese legal-news text.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

nlp_pipeline = LegalExtractionPipeline()

class TextProcessRequest(BaseModel):
    text: str = Field(
        validation_alias=AliasChoices("text", "input"),
        json_schema_extra={
            "examples": [
                "Ngày 15/8, Công an quận Đống Đa đã khởi tố và bắt tạm giam "
                "Nguyễn Văn A vì tội lừa đảo chiếm đoạt tài sản."
            ]
        },
    )


def _process_text(text: str) -> dict:
    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text must not be empty.",
        )

    result = nlp_pipeline.process(text)
    if "error" in result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result["error"],
        )

    return {
        "message": "Text processed successfully.",
        "input_text": text,
        "status": "success",
        "entities": result["entities"],
        "events": result["events"],
    }


@app.post("/api/process", summary="Recognize entities and extract events from text")
def process_text_endpoint(payload: TextProcessRequest) -> dict:
    return _process_text(payload.text)


@app.post("/api/process/event-trigger", summary="Detect event triggers from text")
def detect_event_triggers(payload: TextProcessRequest) -> dict:
    if not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text must not be empty.",
        )

    return {
        "input_text": payload.text,
        "triggers": detect_triggers(payload.text),
    }


@app.post("/api/process-file", summary="Recognize entities and extract events from a UTF-8 file")
async def process_file_endpoint(file: UploadFile = File(...)) -> dict:
    file_bytes = await file.read()
    try:
        text = file_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file must contain UTF-8 text.",
        ) from exc

    return _process_text(text)
