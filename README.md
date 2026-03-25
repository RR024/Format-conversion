# Full-Stack PDF Conversion App

A beginner-friendly and production-ready full-stack web application for converting files using a **Python backend**.

## Features

- Drag-and-drop upload UI
- Supported conversions:
  - PDF to Word (`.docx`)
  - Word to PDF (`.pdf`)
  - Image to PDF (`.pdf`)
  - PDF to Text (`.txt`)
  - Word to Text (`.txt`)
  - PDF to Image (`.png`, first page)
  - Image to Word (`.docx`)
- Upload progress + conversion spinner
- Download converted file
- Built-in editor to create/export documents as PDF or Word
- Secure upload rules:
  - Max file size: 10MB
  - Allowed file formats only
- Temporary file cleanup after processing
- Environment variable support

## Project Structure

```text
Format Conversion/
  client/   # React + Vite frontend
  server/   # Python + FastAPI backend
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- npm 9+
- LibreOffice (required for Word to PDF)

## 1) Setup Backend

```bash
cd server
python -m venv .venv
```

Activate venv:

- Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

- Windows CMD:

```cmd
.venv\Scripts\activate.bat
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Create environment file:

- Copy `.env.example` to `.env`

Example `.env`:

```env
PORT=5000
```

Run backend:

```bash
python main.py
```

## 2) Setup Frontend

```bash
cd ../client
npm install
```

Create environment file:

- Copy `.env.example` to `.env`
- Set API URL if needed

Example `.env`:

```env
VITE_API_URL=http://localhost:5000
```

Run frontend:

```bash
npm run dev
```

Open the app at `http://localhost:5173`.

## Editor Feature

- Open the `Word/PDF Editor` tab in the UI
- Drop a PDF/Word file (`.pdf`, `.doc`, `.docx`) to import into a page-like rich editor
- Or enter a title and content manually
- Use toolbar actions (Bold, Italic, Headings, Lists) while editing
- Export directly as PDF or Word (`.docx`)
- Download is returned immediately after export

## API Endpoint

- `POST /api/convert`
  - Form Data:
    - `file`: uploaded file
    - `conversionType`: one of `pdf-to-word`, `word-to-pdf`, `image-to-pdf`, `pdf-to-text`, `word-to-text`, `pdf-to-image`, `image-to-word`
  - Returns converted file as download

- `POST /api/editor/export`
  - JSON Body:
    - `title`: document title
    - `content`: text content from editor
    - `format`: `pdf` or `docx`
  - Returns exported file as download

- `POST /api/editor/import`
  - Form Data:
    - `file`: PDF or Word file (`.pdf`, `.doc`, `.docx`)
  - Returns extracted text and title for in-app editing

## Security and Cleanup Notes

- FastAPI upload handling enforces **10MB max upload size**
- Backend accepts only supported file extensions per conversion type
- Input and output temporary files are deleted after response

## Deployment Notes

- This repo now includes a root `Dockerfile` that builds frontend + backend and serves both from one container.
- FastAPI serves the built React app from `server/static` in production.

### Host On Render / Railway (Recommended)

1. Push this repository to GitHub.
2. Create a new **Web Service** from the repo.
3. Choose **Dockerfile** deploy (root `Dockerfile`).
4. Set environment variable:
  - `PORT=5000` (or let platform inject `PORT`)
5. Deploy.

After deploy, your app is available at your service URL (frontend + backend together).

### Local Docker Run

```bash
docker build -t format-conversion-app .
docker run -p 5000:5000 format-conversion-app
```

Open `http://localhost:5000`.

## Conversion Engine Notes

- PDF to Word: `pdf2docx`
- Word to PDF: LibreOffice (`soffice --headless`)
- Image to PDF: `Pillow`
- Editor to Word: `python-docx`
- Editor to PDF: `reportlab`
