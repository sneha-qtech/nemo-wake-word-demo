"""
Virtual Buddy Wake-Word Demo - Minimal Backend
This is a minimal FastAPI backend for Google Gemini LLM integration.
The core wake word detection happens in the frontend using Web Speech API.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

app = FastAPI(title="Virtual Buddy Wake-Word Demo API", version="1.0.0")

# Add CORS middleware to allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for demo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini client
gemini_api_key = os.getenv("GEMINI_API_KEY")
if not gemini_api_key:
    print("WARNING: GEMINI_API_KEY not found in environment variables")
    print("Set GEMINI_API_KEY in .env file to use real LLM responses")

client = genai.Client(api_key=gemini_api_key) if gemini_api_key else None

# Mock responses for demonstration (no API key required)
MOCK_RESPONSES = {
    "what is the weather": "The weather is sunny with a temperature of 25°C.",
    "what time is it": "The current time is now.",
    "tell me a joke": "Why did the scarecrow win an award? Because he was outstanding in his field!",
    "hello": "Hello! How can I help you today?",
    "hey siri": "I'm listening! What would you like me to do?",
}


class CommandRequest(BaseModel):
    command: str
    language: Optional[str] = "en"


class CommandResponse(BaseModel):
    response: str
    command: str


@app.get("/")
def read_root():
    """Root endpoint"""
    return {
        "message": "Virtual Buddy Wake-Word Demo API",
        "status": "running",
        "description": "Backend for Google Gemini LLM integration",
        "llm_enabled": bool(gemini_api_key),
        "wake_word": "Hey Siri"
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "llm_enabled": bool(gemini_api_key)}


@app.post("/api/command", response_model=CommandResponse)
def process_command(request: CommandRequest):
    """
    Process a command using Google Gemini LLM.
    
    This integrates with Google's Gemini model for intelligent responses.
    """
    print(f"Received command: {request.command}")
    print(f"Gemini client available: {client is not None}")
    
    if not client:
        print("Using mock responses (no API key)")
        # Fallback to mock responses if API key not configured
        command_lower = request.command.lower().strip()
        for key, response in MOCK_RESPONSES.items():
            if key in command_lower:
                print(f"Mock response matched: {key}")
                return CommandResponse(
                    response=response,
                    command=request.command
                )
        
        print("Using default mock response")
        return CommandResponse(
            response=f"I heard you say: {request.command}",
            command=request.command
        )
    
    try:
        print("Calling Gemini API...")
        # Use Gemini for intelligent response with new API
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=[f"You are Siri, a helpful voice assistant. Keep responses concise and friendly. User says: {request.command}"]
        )
        
        ai_response = response.text
        print(f"Gemini response: {ai_response}")
        
        return CommandResponse(
            response=ai_response,
            command=request.command
        )
        
    except Exception as e:
        print(f"Gemini API error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"LLM processing failed: {str(e)}")


@app.get("/api/wake-word/status")
def wake_word_status():
    """
    Get wake word configuration status.
    This is informational only - actual wake word detection happens in the frontend.
    """
    return {
        "wake_word": "Hey Siri",
        "status": "active",
        "detection_method": "frontend_pattern_matching",
        "stt_method": "web_speech_api",
        "llm_enabled": bool(gemini_api_key),
        "llm_type": "google_gemini" if gemini_api_key else "mock_responses"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
