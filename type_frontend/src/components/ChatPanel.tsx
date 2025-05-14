import React, { useState, useRef, useEffect } from "react";
import "./ChatPanel.css";
import { CommandSuggestion } from "../utils/commandFixerAgent";

interface Message {
  id: number;
  text: string;
  isError: boolean;
  timestamp: Date;
  suggestions?: CommandSuggestion[];
  isSuggestion?: boolean;
}

interface ChatPanelProps {
  messages: Message[];
  addMessage: (text: string, isError: boolean) => void;
  runCommand?: (command: string) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  addMessage,
  runCommand,
}) => {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      addMessage(inputValue, false);
      setInputValue("");
    }
  };

  const handleRunCommand = (command: string) => {
    if (runCommand) {
      runCommand(command);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h2>Terminal Messages</h2>
      </div>

      <div className="messages-container">
        {messages.map((message) => {
          const messageDate = new Date(message.timestamp);
          const timeString = messageDate.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <React.Fragment key={message.id}>
              <div className="message-time-header">{timeString}</div>

              {message.isSuggestion ? (
                <div className="message suggestion-message">
                  <div className="message-text">
                    <div className="suggestion-title">💡 Suggestions:</div>
                    <ol className="suggestion-list">
                      {message.suggestions?.map((suggestion, index) => (
                        <li key={index} className="suggestion-item">
                          <span className="suggestion-command">
                            {suggestion.command}
                          </span>
                          <span className="suggestion-arrow">→</span>
                          <span className="suggestion-desc">
                            {suggestion.description}
                          </span>
                          {runCommand && (
                            <button
                              className="run-command-btn"
                              onClick={() =>
                                handleRunCommand(suggestion.command)
                              }
                            >
                              Run
                            </button>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : (
                <div
                  className={`message ${
                    message.isError ? "error-message" : "user-message"
                  }`}
                >
                  <div className="message-text">{message.text}</div>
                </div>
              )}
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
        />
        <button type="submit" className="send-button">
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;
