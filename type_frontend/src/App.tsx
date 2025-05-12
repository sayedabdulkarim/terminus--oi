import React, { useState, useCallback } from "react";
import "./App.css";
import Terminal from "./components/Terminal";
import ChatPanel from "./components/ChatPanel";

interface Message {
  id: number;
  text: string;
  isError: boolean;
  timestamp: Date;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Welcome to the terminal. Error messages will appear here.",
      isError: false,
      timestamp: new Date(),
    },
  ]);

  // Memoize addMessage to prevent unnecessary re-renders
  const addMessage = useCallback((text: string, isError: boolean) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      {
        id: Date.now(),
        text,
        isError,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Memoize addErrorMessage for Terminal component
  const addErrorMessage = useCallback(
    (message: string) => {
      addMessage(message, true);
    },
    [addMessage]
  );

  return (
    <div className="App">
      <div className="split-screen">
        <div className="chat-side">
          <ChatPanel messages={messages} addMessage={addMessage} />
        </div>
        <div className="terminal-side">
          <Terminal addErrorMessage={addErrorMessage} />
        </div>
      </div>
    </div>
  );
}

export default App;
