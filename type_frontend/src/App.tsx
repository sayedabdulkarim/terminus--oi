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
      if (!command || typeof command !== "string") {
        console.warn("Invalid command passed to runCommand:", command);
        return;
      }

      // The terminal component will expose this function globally
      if ((window as any).runTerminalCommand) {
        try {
          (window as any).runTerminalCommand(command);
          // Also add the command as a message to show what was executed
          addMessage(`Executed: ${command}`, false);
        } catch (e) {
          console.error("Error running command:", e);
          // Add an error message if the command execution fails
          addMessage(`Failed to execute: ${command}. Please try again.`, true);
        }
      } else {
        console.warn("runTerminalCommand function not available");
        addMessage(`Unable to run command: Terminal not ready`, true);
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
