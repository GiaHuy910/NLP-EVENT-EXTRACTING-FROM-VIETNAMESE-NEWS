import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from server.src.ner_pipeline import app as nlp_app


class NERAppAPITests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(nlp_app.app)

    def test_process_accepts_client_text_field_and_returns_expected_shape(self) -> None:
        text = "Công an đã khởi tố Nguyễn Văn A."
        pipeline_result = {
            "text": text,
            "entities": [
                {
                    "text": "Nguyễn Văn A",
                    "label": "PERSON",
                    "start": 21,
                    "end": 33,
                }
            ],
            "events": [],
        }
        with patch.object(nlp_app.nlp_pipeline, "process", return_value=pipeline_result):
            response = self.client.post("/api/process", json={"text": text})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "message": "Text processed successfully.",
                "input_text": text,
                "status": "success",
                "entities": pipeline_result["entities"],
                "events": [],
            },
        )

    def test_process_keeps_compatibility_with_input_field(self) -> None:
        text = "Một câu."
        with patch.object(
            nlp_app.nlp_pipeline,
            "process",
            return_value={"text": text, "entities": [], "events": []},
        ):
            response = self.client.post("/api/process", json={"input": text})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["input_text"], text)

    def test_process_accepts_text_longer_than_256_words(self) -> None:
        text = " ".join(f"word{index}" for index in range(300))
        with patch.object(
            nlp_app.nlp_pipeline,
            "process",
            return_value={"text": text, "entities": [], "events": []},
        ):
            response = self.client.post("/api/process", json={"text": text})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["input_text"], text)

    def test_process_rejects_empty_text(self) -> None:
        response = self.client.post("/api/process", json={"text": "  "})
        self.assertEqual(response.status_code, 400)

    def test_event_trigger_route_accepts_client_text_field(self) -> None:
        text = "Công an đã khởi tố Nguyễn Văn A."
        triggers = [
            {
                "text": "khởi tố",
                "event_type": "KHOI_TO",
                "start": 13,
                "end": 20,
            }
        ]
        with patch.object(nlp_app, "detect_triggers", return_value=triggers) as detect:
            response = self.client.post(
                "/api/process/event-trigger", json={"text": text}
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {"input_text": text, "triggers": triggers}
        )
        detect.assert_called_once_with(text)

    def test_process_file_rejects_non_utf8_upload(self) -> None:
        response = self.client.post(
            "/api/process-file",
            files={"file": ("input.txt", b"\xff", "text/plain")},
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
