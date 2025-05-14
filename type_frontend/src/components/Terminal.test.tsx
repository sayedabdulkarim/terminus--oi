import React from "react";
import { render, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import TerminalComponent from "./Terminal";
import { commandFixerAgent } from "../utils/commandFixerAgent";

// Declare additional typings for window object
declare global {
  interface Window {
    runTerminalCommand: (command: string) => void;
  }
}

interface SocketHandlers {
  [key: string]: (data: any) => void;
}

// Mock socket.io-client
const mockSocketOn = jest.fn();
const mockSocketEmit = jest.fn();
const mockSocketDisconnect = jest.fn();
let socketHandlers: SocketHandlers = {};

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => ({
    on: jest.fn((event: string, handler: (data: any) => void) => {
      socketHandlers[event] = handler;
      return mockSocketOn(event, handler);
    }),
    emit: mockSocketEmit,
    disconnect: mockSocketDisconnect,
  })),
}));

interface TerminalMockInstance {
  write: jest.Mock;
  onData: jest.Mock;
  dataCallback: ((data: string) => void) | null;
  open: jest.Mock;
  dispose: jest.Mock;
  cols: number;
  rows: number;
}

// Mock terminal instance that we can control in tests
const mockTerminalInstance: TerminalMockInstance = {
  write: jest.fn(),
  onData: jest.fn(),
  dataCallback: null,
  open: jest.fn(),
  dispose: jest.fn(),
  cols: 80,
  rows: 24,
};

// Mock xterm
jest.mock("xterm", () => ({
  Terminal: jest.fn().mockImplementation(() => {
    mockTerminalInstance.onData = jest.fn(
      (callback: (data: string) => void) => {
        mockTerminalInstance.dataCallback = callback;
      }
    );
    return mockTerminalInstance;
  }),
}));

// Mock xterm-addon-fit
jest.mock("xterm-addon-fit", () => ({
  FitAddon: jest.fn().mockImplementation(() => ({
    fit: jest.fn(),
  })),
}));

// Mock xterm-addon-web-links
jest.mock("xterm-addon-web-links", () => ({
  WebLinksAddon: jest.fn().mockImplementation(() => ({})),
}));

// Define CommandSuggestion interface
interface CommandSuggestion {
  command: string;
  description: string;
}

// Mock commandFixerAgent
jest.mock("../utils/commandFixerAgent", () => ({
  commandFixerAgent: jest
    .fn()
    .mockImplementation(async (): Promise<CommandSuggestion[]> => {
      return [
        { command: "mkdir", description: "Create directory (correct command)" },
      ];
    }),
}));

// Helper function to simulate user typing in terminal
const simulateTerminalInput = (text: string): void => {
  if (mockTerminalInstance.dataCallback) {
    // For each character, call the callback
    for (const char of text) {
      mockTerminalInstance.dataCallback(char);
    }
  }
};

// Helper function to simulate pressing Enter
const simulateEnterPress = (): void => {
  if (mockTerminalInstance.dataCallback) {
    mockTerminalInstance.dataCallback("\r");
  }
};

// Helper function to simulate terminal output
const simulateTerminalOutput = (output: string): void => {
  if (socketHandlers["output"]) {
    socketHandlers["output"](output);
  }
};

describe("Terminal Component", () => {
  let addErrorMessage: jest.Mock;
  let addMessage: jest.Mock;
  let addSuggestions: jest.Mock;
  let runCommand: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Reset socket handlers
    socketHandlers = {};

    // Setup mocks
    addErrorMessage = jest.fn();
    addMessage = jest.fn();
    addSuggestions = jest.fn();
    runCommand = jest.fn();

    // Mock Date.now for predictable cache expiration tests
    jest.spyOn(Date, "now").mockImplementation(() => 1000);
  });

  afterEach(() => {
    // Cleanup date mock
    jest.restoreAllMocks();
  });

  test("renders terminal container", () => {
    render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // Check that Terminal was initialized
    const { Terminal } = require("xterm");
    expect(Terminal).toHaveBeenCalled();

    // Check that terminal was opened
    expect(mockTerminalInstance.open).toHaveBeenCalled();
  });

  test("executes command when user types and presses Enter", () => {
    render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // Simulate user typing a command
    act(() => {
      simulateTerminalInput("ls -la");
      simulateEnterPress();
    });

    // Check that the command was sent to the server
    expect(mockSocketEmit).toHaveBeenCalledWith("input", "ls -la");
    expect(mockSocketEmit).toHaveBeenCalledWith("input", "\r");
  });

  test("maintains command history", () => {
    render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // Simulate user typing multiple commands
    act(() => {
      simulateTerminalInput("ls -la");
      simulateEnterPress();
    });

    act(() => {
      simulateTerminalInput("cd /tmp");
      simulateEnterPress();
    });

    act(() => {
      simulateTerminalInput("pwd");
      simulateEnterPress();
    });

    // Since command history is internal to the component, we can verify
    // commands were sent to the server in the right order
    const inputCalls = mockSocketEmit.mock.calls.filter(
      (call) => call[0] === "input"
    );
    expect(inputCalls).toContainEqual(["input", "ls -la"]);
    expect(inputCalls).toContainEqual(["input", "cd /tmp"]);
    expect(inputCalls).toContainEqual(["input", "pwd"]);
  });

  test('detects and handles "command not found" error', async () => {
    render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // Simulate user typing an invalid command
    act(() => {
      simulateTerminalInput("mk");
      simulateEnterPress();
    });

    // Simulate terminal output with error
    act(() => {
      simulateTerminalOutput("zsh: command not found: mk\r\n");
    });

    // Wait for error message to be added
    await waitFor(() => {
      expect(addErrorMessage).toHaveBeenCalled();
    });

    // Wait for suggestions to be requested
    await waitFor(() => {
      expect(commandFixerAgent).toHaveBeenCalledWith(
        "mk",
        "zsh: command not found: mk"
      );
    });

    // Wait for suggestions to be added
    await waitFor(() => {
      expect(addSuggestions).toHaveBeenCalled();
    });

    // Verify correct parameters were passed to addSuggestions
    expect(addSuggestions).toHaveBeenCalledWith(
      "mk",
      "zsh: command not found: mk",
      expect.any(Array)
    );
  });

  test("correctly extracts command from shell error message", async () => {
    render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // Simulate user typing invalid commands
    act(() => {
      simulateTerminalInput("mk");
      simulateEnterPress();
    });

    // Simulate terminal output with error
    act(() => {
      simulateTerminalOutput("zsh: command not found: mk\r\n");
    });

    // Wait for the commandFixerAgent to be called with correct command
    await waitFor(() => {
      expect(commandFixerAgent).toHaveBeenCalledWith("mk", expect.any(String));
    });
  });

  test("correctly handles node version flag errors", async () => {
    // Mock commandFixerAgent for this specific test
    (commandFixerAgent as jest.Mock).mockResolvedValueOnce([
      { command: "node -v", description: "Show Node.js version" },
      { command: "node --version", description: "Show Node.js version" },
    ]);

    render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // Simulate user typing a node command with wrong flag
    act(() => {
      simulateTerminalInput("node -ver");
      simulateEnterPress();
    });

    // Simulate terminal output with error
    act(() => {
      simulateTerminalOutput("bad option: -ver\r\n");
    });

    // Wait for error message to be added
    await waitFor(() => {
      expect(addErrorMessage).toHaveBeenCalled();
    });

    // Wait for suggestions to include node version flag correction
    await waitFor(() => {
      expect(commandFixerAgent).toHaveBeenCalledWith(
        "node -ver",
        "bad option: -ver"
      );
    });
  });

  test("correctly handles Python version flag errors", async () => {
    // Mock commandFixerAgent for this specific test
    (commandFixerAgent as jest.Mock).mockResolvedValueOnce([
      { command: "python -V", description: "Show Python version" },
      { command: "python --version", description: "Show Python version" },
    ]);

    render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // Simulate user typing a python command with wrong flag
    act(() => {
      simulateTerminalInput("python --v");
      simulateEnterPress();
    });

    // Simulate terminal output with error
    act(() => {
      simulateTerminalOutput("unknown option --v\r\n");
    });

    // Wait for error message to be added
    await waitFor(() => {
      expect(addErrorMessage).toHaveBeenCalled();
    });

    // Wait for suggestions for Python
    await waitFor(() => {
      expect(commandFixerAgent).toHaveBeenCalledWith(
        "python --v",
        "unknown option --v"
      );
    });
  });

  test("avoids duplicate error processing", async () => {
    render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // Simulate user typing an invalid command
    act(() => {
      simulateTerminalInput("mk");
      simulateEnterPress();
    });

    // Simulate terminal output with the same error twice
    act(() => {
      simulateTerminalOutput("zsh: command not found: mk\r\n");
      simulateTerminalOutput("zsh: command not found: mk\r\n"); // Duplicate
    });

    // Check that error processing only happened once
    await waitFor(() => {
      expect(addErrorMessage).toHaveBeenCalledTimes(1);
    });
  });

  test("processes new errors after different commands", async () => {
    render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // First command and error
    act(() => {
      simulateTerminalInput("mk");
      simulateEnterPress();
      simulateTerminalOutput("zsh: command not found: mk\r\n");
    });

    // Wait for first error to be processed
    await waitFor(() => {
      expect(addErrorMessage).toHaveBeenCalledTimes(1);
    });

    // Reset mocks to check for new calls
    jest.clearAllMocks();

    // Second different command and error
    act(() => {
      simulateTerminalInput("mkdi");
      simulateEnterPress();
      simulateTerminalOutput("zsh: command not found: mkdi\r\n");
    });

    // Check that the new error was processed
    await waitFor(() => {
      expect(addErrorMessage).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(commandFixerAgent).toHaveBeenCalledWith(
        "mkdi",
        "zsh: command not found: mkdi"
      );
    });
  });

  test("handles cache expiration for command error pairs", async () => {
    // Mock Date.now to control time
    const realDateNow = Date.now;
    const mockTime = 1620000000000; // Fixed timestamp

    try {
      Date.now = jest.fn().mockReturnValue(mockTime);

      // Render component
      render(
        <TerminalComponent
          addErrorMessage={addErrorMessage}
          addMessage={addMessage}
          addSuggestions={addSuggestions}
          runCommand={runCommand}
        />
      );

      // First command and error
      act(() => {
        simulateTerminalInput("mk");
        simulateEnterPress();
        simulateTerminalOutput("zsh: command not found: mk\r\n");
      });

      // Wait for first error to be processed
      await waitFor(() => {
        expect(addErrorMessage).toHaveBeenCalledTimes(1);
      });

      // Clear mocks to check for new calls
      jest.clearAllMocks();

      // Advance time by 31 seconds (cache expires after 30 seconds)
      Date.now = jest.fn().mockReturnValue(mockTime + 31000);

      // Same command and error again, but after cache expiration
      act(() => {
        simulateTerminalInput("mk");
        simulateEnterPress();
        simulateTerminalOutput("zsh: command not found: mk\r\n");
      });

      // Check that the error was processed again due to cache expiration
      await waitFor(() => {
        expect(addErrorMessage).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(commandFixerAgent).toHaveBeenCalledWith(
          "mk",
          "zsh: command not found: mk"
        );
      });
    } finally {
      // Restore original Date.now
      Date.now = realDateNow;
    }
  });

  test("cleanup is performed on unmount", () => {
    // Render and unmount component
    const { unmount } = render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // Unmount the component
    unmount();

    // Check that cleanup was performed
    expect(mockTerminalInstance.dispose).toHaveBeenCalled();
  });

  test("exposes runTerminalCommand function when runCommand prop is provided", () => {
    // Render component with runCommand prop
    render(
      <TerminalComponent
        addErrorMessage={addErrorMessage}
        addMessage={addMessage}
        addSuggestions={addSuggestions}
        runCommand={runCommand}
      />
    );

    // Check that global function was set
    expect(window.runTerminalCommand).toBeDefined();
  });
});
