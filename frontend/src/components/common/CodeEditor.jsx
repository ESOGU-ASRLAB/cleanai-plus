import React from "react";
import Editor from "@monaco-editor/react";

const CodeEditor = ({
  language = "python",
  value,
  onChange,
  height = "300px",
  readOnly = false,
  theme = "light", // or "vs-dark"
  ...props
}) => {
  return (
    <div className="border border-gray-300 rounded-md overflow-hidden">
      <Editor
        height={height}
        defaultLanguage={language}
        value={value}
        onChange={onChange}
        theme={theme}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 14,
          readOnly: readOnly,
          ...props.options,
        }}
        {...props}
      />
    </div>
  );
};

export default CodeEditor;
