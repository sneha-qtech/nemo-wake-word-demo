# Virtual Buddy Wake-Word Demo - Backend Setup

## Overview

Minimal FastAPI backend with OpenAI LLM integration for the Virtual Buddy Wake-Word Demo.

## Architecture

```
Frontend (Next.js)
    ↓ HTTP POST
Backend (FastAPI)
    ↓ OpenAI API
LLM Response
    ↓
Frontend displays response
```

## Setup Instructions

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure OpenAI API Key

Create a `.env` file in the backend directory:

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=your_actual_api_key_here
```

**Get API Key:** https://platform.openai.com/api-keys

### 3. Run the Backend

```bash
cd backend
python main.py
```

The backend will start on `http://localhost:8000`

### 4. Start the Frontend

In a separate terminal:

```bash
cd nemo-wake-word-demo
npm run dev
```

The frontend will start on `http://localhost:3000`

## API Endpoints

### GET `/`
Root endpoint with API status

### GET `/health`
Health check endpoint

### POST `/api/command`
Process command using OpenAI LLM

**Request:**
```json
{
  "command": "What is the weather?",
  "language": "en"
}
```

**Response:**
```json
{
  "response": "The weather is sunny with a temperature of 25°C.",
  "command": "What is the weather?"
}
```

### GET `/api/wake-word/status`
Get wake word configuration status

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for LLM integration |

## Fallback Behavior

If `OPENAI_API_KEY` is not configured:
- Backend uses mock responses
- LLM features still work with pre-defined responses
- No API calls are made

## Mock Responses (Fallback)

- "what is the weather" → Weather information
- "what time is it" → Current time
- "tell me a joke" → Joke
- "hello" → Greeting
- Other → Echo command

## LLM Configuration

**Model:** GPT-3.5-turbo

**Parameters:**
- `max_tokens`: 150 (keep responses concise)
- `temperature`: 0.7 (balanced creativity)
- `system_prompt`: "You are Nemo, a helpful voice assistant. Keep responses concise and friendly."

## Troubleshooting

### Backend Won't Start

**Check:**
- Python 3.8+ installed
- Dependencies installed: `pip install -r requirements.txt`
- Port 8000 not in use

### LLM Responses Fail

**Check:**
- `.env` file exists in backend directory
- `OPENAI_API_KEY` is set correctly
- API key has sufficient credits
- Internet connection available

### Frontend Can't Connect to Backend

**Check:**
- Backend is running on port 8000
- CORS is not blocking requests
- Frontend is configured to call `http://localhost:8000`

## Project Structure

```
backend/
├── main.py              # FastAPI application
├── requirements.txt      # Python dependencies
├── .env.example         # Environment variables template
└── .env                 # Actual environment variables (not in git)
```

## Files Modified

### backend/main.py
- Added OpenAI integration
- Added LLM processing endpoint
- Added fallback to mock responses
- Added environment variable loading

### backend/requirements.txt
- Added openai package
- Added python-dotenv package

### backend/.env.example
- Created environment variables template

### app/page.tsx
- Updated processCommand to call backend API
- Added error handling for backend failures
- Added fallback to mock responses

## Security Notes

- Never commit `.env` file with actual API keys
- Use environment variables for sensitive data
- API keys are loaded from environment, not hardcoded
