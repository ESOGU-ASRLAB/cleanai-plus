import React, { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { FiCode } from "react-icons/fi";

const WindowedCodeEditor = ({
  fileName = "script",
  onFileNameChange,
  value,
  onChange,
  language = "python",
  height = "400px",
  readOnly = false,
  onMount,
  ...props
}) => {
  const [cursorPosition, setCursorPosition] = useState({
    lineNumber: 1,
    column: 1,
  });

  const wsRef = useRef(null);
  const completionProviderRef = useRef(null);
  const hoverProviderRef = useRef(null);

  useEffect(() => {
    if (!readOnly && language === "python") {
      wsRef.current = new WebSocket("ws://localhost:8000/api/ws/code-assist");

      return () => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    }
  }, [readOnly, language]);

  const handleEditorMount = (editor, monaco) => {
    // Listen for cursor position changes
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        lineNumber: e.position.lineNumber,
        column: e.position.column,
      });
    });

    if (!readOnly && language === "python") {
      // Register completion provider
      completionProviderRef.current =
        monaco.languages.registerCompletionItemProvider("python", {
          provideCompletionItems: (model, position) => {
            // Only provide completions for this editor's model
            if (model !== editor.getModel()) {
              return { suggestions: [] };
            }

            return new Promise((resolve) => {
              if (
                !wsRef.current ||
                wsRef.current.readyState !== WebSocket.OPEN
              ) {
                resolve({ suggestions: [] });
                return;
              }

              const code = model.getValue();
              const request = {
                type: "completion",
                code: code,
                line: position.lineNumber,
                column: position.column,
              };

              const handleMessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "completion") {
                  wsRef.current.removeEventListener("message", handleMessage);
                  const suggestions = (data.suggestions || []).map((s) => ({
                    ...s,
                    documentation: s.documentation,
                    insertText: s.insertText || s.label,
                  }));
                  resolve({ suggestions: suggestions });
                }
              };

              wsRef.current.addEventListener("message", handleMessage);
              wsRef.current.send(JSON.stringify(request));
            });
          },
          triggerCharacters: ["."],
        });

      // Register hover provider
      hoverProviderRef.current = monaco.languages.registerHoverProvider(
        "python",
        {
          provideHover: (model, position) => {
            // Only provide hover for this editor's model
            if (model !== editor.getModel()) {
              return { contents: [] };
            }

            return new Promise((resolve) => {
              if (
                !wsRef.current ||
                wsRef.current.readyState !== WebSocket.OPEN
              ) {
                resolve({ contents: [] });
                return;
              }

              const code = model.getValue();
              const request = {
                type: "hover",
                code: code,
                line: position.lineNumber,
                column: position.column,
              };

              const handleMessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "hover") {
                  wsRef.current.removeEventListener("message", handleMessage);
                  resolve({ contents: data.contents || [] });
                }
              };

              wsRef.current.addEventListener("message", handleMessage);
              wsRef.current.send(JSON.stringify(request));
            });
          },
        },
      );
    }

    // Call parent onMount if provided
    if (onMount) {
      onMount(editor, monaco);
    }
  };

  // Cleanup providers on unmount is tricky because handleEditorMount runs once.
  // We can try to dispose in useEffect but we need reference to the disposables setup in handleEditorMount.
  // We used refs for this.
  useEffect(() => {
    return () => {
      if (completionProviderRef.current)
        completionProviderRef.current.dispose();
      if (hoverProviderRef.current) hoverProviderRef.current.dispose();
    };
  }, []);

  return (
    <div
      className="border border-gray-300 rounded-md overflow-hidden flex flex-col bg-white"
      style={{ height }}
    >
      {/* Editor Window Header */}
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-400 border border-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-400 border border-green-500"></div>
        </div>
        <div className="flex items-center bg-white border border-gray-300 rounded px-2 py-0.5 text-sm shadow-sm">
          <FiCode className="text-gray-400 mr-2" size={14} />
          {onFileNameChange && !readOnly ? (
            <input
              type="text"
              value={fileName}
              onChange={(e) => onFileNameChange(e.target.value)}
              className="outline-none text-gray-700 w-32 font-mono text-center bg-transparent"
              placeholder="filename"
              readOnly={readOnly}
            />
          ) : (
            <span className="text-gray-700 font-mono px-2">{fileName}</span>
          )}
          <span className="text-gray-500 font-mono">.py</span>
        </div>
        <div className="w-12"></div>
      </div>

      {/* Editor */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          defaultLanguage={language}
          value={value}
          onChange={onChange}
          onMount={handleEditorMount}
          theme="vs-light"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fixedOverflowWidgets: true,
            scrollBeyondLastLine: false,
            padding: { top: 10, bottom: 10 },
            readOnly: readOnly,
            suggest: {
              showWords: true,
              showSnippets: true,
            },
            ...props.options,
          }}
        />
      </div>

      {/* Editor Footer */}
      <div className="bg-primary-600 text-white text-xs px-4 py-1.5 flex justify-end items-center font-mono shrink-0">
        <span>
          Ln {cursorPosition.lineNumber}, Col {cursorPosition.column}
        </span>
      </div>
    </div>
  );
};

export default WindowedCodeEditor;
