import React, { useState, useCallback } from "react";
import "./App.css";
import Terminal from "./components/Terminal";
import ChatPanel from "./components/ChatPanel";
import { CommandSuggestion } from "./utils/commandFixerAgent";

interface Message {
  id: number;
  text: string;
  isError: boolean;
  timestamp: Date;
  suggestions?: CommandSuggestion[];
  isSuggestion?: boolean;
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

  // Add command suggestions to the chat panel
  const addSuggestions = useCallback(
    (
      originalCommand: string,
      errorMessage: string,
      suggestions: CommandSuggestion[]
    ) => {
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          id: Date.now(),
          text: `Suggestions for: ${originalCommand}`,
          isError: false,
          isSuggestion: true,
          suggestions,
          timestamp: new Date(),
        },
      ]);
    },
    []
  );

  // Run a command in the terminal
  const runCommand = useCallback(
    (command: string) => {
      // The terminal component will expose this function globally
      if ((window as any).runTerminalCommand) {
        (window as any).runTerminalCommand(command);
        // Also add the command as a message to show what was executed
        addMessage(`Executed: ${command}`, false);
      }
    },
    [addMessage]
  );

  return (
    <div className="App">
      <div className="split-screen">
        <div className="chat-side">
          <ChatPanel
            messages={messages}
            addMessage={addMessage}
            runCommand={runCommand}
          />
        </div>
        <div className="terminal-side">
          <Terminal
            addErrorMessage={addErrorMessage}
            addSuggestions={addSuggestions}
            runCommand={runCommand}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
