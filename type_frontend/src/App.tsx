import React, { useState } from "react";
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

  const addMessage = (text: string, isError: boolean) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      {
        id: Date.now(),
        text,
        isError,
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div className="App">
      <div className="split-screen">
        <div className="chat-side">
          <ChatPanel messages={messages} addMessage={addMessage} />
        </div>
        <div className="terminal-side">
          <Terminal addErrorMessage={(message) => addMessage(message, true)} />
        </div>
      </div>
    </div>
  );
}

export default App;
