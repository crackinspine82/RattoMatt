# Syllabus Extraction Prompt (Gemini)

Use this prompt when sending **one chapter PDF** to Gemini. The model must return **strict JSON only** (no markdown fences, no prose). The script parses the response as JSON.

## Placeholders

- `{BOARD}` — e.g. ICSE, CBSE
- `{GRADE}` — e.g. 9, 10
- `{SUBJECT}` — e.g. Geography, HistoryCivics
- `{CHAPTER_NUMBER}` — sequence number of this chapter (from filename)
- `{CHAPTER_TITLE}` — chapter title from filename (e.g. "Earth as a Planet", "The Harappan Civilization")
- `{DISCIPLINE}` — optional; for HistoryCivics use "history" or "civics", for single-discipline subjects leave empty or ""

---

## Prompt text

```
You are extracting syllabus structure from a textbook chapter PDF for an Indian board (board: {BOARD}, grade: {GRADE}, subject: {SUBJECT}).

This PDF is chapter {CHAPTER_NUMBER}: "{CHAPTER_TITLE}". {DISCIPLINE_LINE}

Output a single JSON object with this exact structure. No other text, no markdown code fences, no explanation. Only valid JSON.

{
  "chapter_title": "<string, may refine from PDF>",
  "sequence_number": {CHAPTER_NUMBER},
  "discipline": "<string or null: 'history' | 'civics' only for HistoryCivics; null for other subjects>",
  "topics": [
    {
      "title": "<string>",
      "sequence_number": <number>,
      "micro_topics": [
        { "title": "<string>", "sequence_number": <number> }
      ]
    }
  ],
  "structure_notes": "<optional brief note on how the chapter is organized, or empty string>"
}

Hierarchy rules (critical):
- A "topic" is a major section or heading in the chapter (e.g. larger font, or main numbering like 1, 2, 3).
- A "micro_topic" is a sub-point that belongs under that section only: it appears under that heading in the PDF (smaller font, indented, or sub-numbering like 1.1, 1.2). Do not put a sub-point as a sibling of its section—it must be a micro_topic under the correct topic.
- Example: In "The Harappan Civilisation", if the book has a section "Sources" with sub-items "The Great Bath", "The Citadel", then create one topic with title "Sources" and micro_topics [{"title": "The Great Bath", "sequence_number": 1}, {"title": "The Citadel", "sequence_number": 2}, ...]. Do not list "Sources", "The Great Bath", and "The Citadel" as sibling micro_topics of a single topic.
- Use the PDF layout, indentation, and numbering to decide what is a section (topic) vs what is a sub-point (micro_topic under that topic). Preserve this relative context.

Rules:
- Infer topics and micro_topics from headings, sections, and bullet lists. Preserve order and hierarchy as in the PDF.
- sequence_number: 1-based integers. Chapter sequence_number is {CHAPTER_NUMBER}.
- For History & Civics chapters, set discipline to "history" or "civics" based on content. For other subjects, set discipline to null.
- If the chapter has no clear sub-structure, use one topic with title same as chapter and micro_topics from the main bullet points or sections.
- In structure_notes, briefly note how the chapter is divided (e.g. major headings and their sub-points).
- Output only the JSON object.
```

**DISCIPLINE_LINE** (insert when subject is HistoryCivics):  
`This chapter belongs to discipline: {DISCIPLINE}. Set "discipline" in the JSON to "{DISCIPLINE}".`  
Otherwise leave blank.
