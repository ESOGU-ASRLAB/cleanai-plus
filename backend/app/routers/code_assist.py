from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
import jedi
import json

router = APIRouter(tags=["Code Assist"])

# Map Jedi types to Monaco CompletionItemKind
JEDI_TO_MONACO_KIND = {
    'module': 9,
    'class': 7,
    'instance': 6,
    'function': 3,
    'param': 6,
    'path': 17,
    'keyword': 14,
    'statement': 14,
    'property': 10
}

@router.websocket("/ws/code-assist")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            raw_data = await websocket.receive_text()
            
            try:
                # Attempt to parse json, if not, treat as code for completion (backward compatibility if needed)
                try:
                    request = json.loads(raw_data)
                    # If it's just a string (from old frontend code), treating it as code
                    if isinstance(request, str):
                         mode = "completion"
                         code = request
                         line = None
                         column = None
                    else:
                        mode = request.get("type", "completion")
                        code = request.get("code", "")
                        line = request.get("line")
                        column = request.get("column")
                except json.JSONDecodeError:
                    mode = "completion"
                    code = raw_data
                    line = None
                    column = None

                script = jedi.Script(code=code)
                
                if mode == "completion":
                    if line is not None and column is not None:
                        # Monaco sends 1-based line and column.
                        # Jedi expects 1-based line and 0-based column.
                        completions = script.complete(line=line, column=column - 1)
                    else:
                        completions = script.complete()
                    
                    suggestions = []
                    for c in completions:
                        kind = JEDI_TO_MONACO_KIND.get(c.type, 1) # Default to Text (1)
                        suggestions.append({
                            "label": c.name,
                            "kind": kind,
                            "detail": c.description,
                            "documentation": c.docstring(),
                            "insertText": c.name
                        })
                    
                    await websocket.send_json({"type": "completion", "suggestions": suggestions})

                elif mode == "hover":
                    if line is not None and column is not None:
                        # Monaco sends 1-based line and column.
                        # Jedi help: line is 1-based, column is 0-based.
                        definitions = script.help(line=line, column=column - 1)
                        
                        contents = []
                        for d in definitions:
                            doc = d.docstring()
                            if doc:
                                contents.append({
                                    "value": f"```python\n{d.name}\n```\n{doc}"
                                })
                        
                        await websocket.send_json({"type": "hover", "contents": contents})
                    else:
                        await websocket.send_json({"type": "hover", "contents": []})

            except Exception as e:
                # Fallback or empty suggestions on error
                print(f"Jedi Error: {e}")
                # Try to answer decently based on mode
                await websocket.send_json({"type": "error", "suggestions": [], "contents": []})
                
    except WebSocketDisconnect:
        pass
