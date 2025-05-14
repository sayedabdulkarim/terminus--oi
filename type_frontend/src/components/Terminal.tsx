import React, { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { Socket, io } from "socket.io-client";
import {
  commandFixerAgent,
  CommandSuggestion,
} from "../utils/commandFixerAgent";
import "xterm/css/xterm.css";
import "./Terminal.css";

interface TerminalProps {
  addErrorMessage: (message: string) => void;
  addSuggestions: (
    originalCommand: string,
    errorMessage: string,
    suggestions: CommandSuggestion[]
  ) => void;
  runCommand?: (command: string) => void;
}

const Terminal: React.FC<TerminalProps> = ({
  addErrorMessage,
  addSuggestions,
  runCommand,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<XTerm | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const processingErrorRef = useRef<boolean>(false);
  const lastCommandRef = useRef<string>("");
  const currentCommandRef = useRef<string>("");

  // Execute a command in the terminal
  const executeCommand = useCallback((command: string) => {
    if (!command) {
      console.warn("Attempted to execute empty command");
      return;
    }

    if (socketRef.current && terminalInstance.current) {
      try {
        // Write the command to terminal
        terminalInstance.current.write(command);
        // Send command to server
        socketRef.current.emit("input", command);
        // Also send an Enter key to execute
        socketRef.current.emit("input", "\r");
      } catch (e) {
        console.error("Error executing command:", e);
        // Try to recover if possible
        setTimeout(() => {
          if (socketRef.current) {
            try {
              socketRef.current.emit("input", command + "\r");
            } catch (innerE) {
              console.error("Retry command execution failed:", innerE);
            }
          }
        }, 100);
      }
    } else {
      console.error("Cannot execute command: terminal or socket not available");
    }
  }, []);

  // Memoize the error detection function to prevent re-creating it on each render
  const detectAndHandleError = useCallback(
    (data: string) => {
      // Don't process if we're already handling an error
      if (processingErrorRef.current) return;

      const errorPatterns = [
        /command not found/i,
        /permission denied/i,
        /no such file or directory/i,
        /cannot access/i,
        /error:/i,
        /failed:/i,
        /bad option/i,
        /not a directory/i,
        /not recognized/i,
        /invalid/i,
        /missing/i,
        /unexpected/i,
        /unrecognized option/i,
        /invalid option/i,
        /syntax error/i,
        /segmentation fault/i,
        /traceback/i,
        /exception/i,
        /cannot/i,
        /could not/i,
        /:/i,
        / option/i,
        / operand/i,
        / token/i,
        / .* but got/i,
      ];

      try {
        // Check if any error pattern matches the data
        const hasError = errorPatterns.some((pattern) => pattern.test(data));

        if (hasError) {
          // Set processing flag to prevent re-entrancy
          processingErrorRef.current = true;

          // Split by both \n and \r\n to handle different line endings
          const lines = data.split(/\r?\n/).filter((line) => line.trim());

          // Find the specific line containing the error
          const errorMessage = lines.find((line) =>
            errorPatterns.some((pattern) => pattern.test(line))
          );

          if (errorMessage) {
            // Format error to include the last command
            const formattedError = lastCommandRef.current
              ? `Error after: ${
                  lastCommandRef.current
                }\n→ ${errorMessage.trim()}`
              : errorMessage.trim();

            // Use requestAnimationFrame to avoid blocking the UI
            requestAnimationFrame(async () => {
              // Add the error message to the chat panel
              addErrorMessage(formattedError);

              // Try to suggest a fixed command if there's a last command
              if (lastCommandRef.current) {
                try {
                  // Get suggested fixes from the command fixer agent
                  const suggestions = await commandFixerAgent(
                    lastCommandRef.current,
                    errorMessage.trim()
                  );

                  // Add the suggestions to the chat panel
                  if (suggestions && suggestions.length > 0) {
                    addSuggestions(
                      lastCommandRef.current,
                      errorMessage.trim(),
                      suggestions
                    );
                  }
                } catch (err) {
                  console.error("Error getting command suggestions:", err);
                }
              }

              // Reset the processing flag after a small delay
              setTimeout(() => {
                processingErrorRef.current = false;
              }, 300);
            });
          } else {
            processingErrorRef.current = false;
          }
        }
      } catch (err) {
        console.error("Error in terminal error detection:", err);
        processingErrorRef.current = false;
      }
    },
    [addErrorMessage, addSuggestions]
  );

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io("http://localhost:3001");

    // Initialize terminal with more robust error handling
    try {
      const term = new XTerm({
        cursorBlink: true,
        theme: {
          background: "#1e1e1e",
          foreground: "#f0f0f0",
        },
        fontFamily: "monospace",
        fontSize: 14,
        scrollback: 1000,
        allowTransparency: true, // Add transparency support
      });

      terminalInstance.current = term;

      // Initialize addons
      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
    } catch (e) {
      console.error("Error initializing terminal:", e);
    }

    // Open terminal
    if (terminalRef.current && terminalInstance.current) {
      terminalInstance.current.open(terminalRef.current);

      // Ensure terminal is properly mounted and visible before fitting
      // Delay the initial fit to ensure the terminal is fully rendered
      setTimeout(() => {
        if (
          fitAddonRef.current &&
          terminalInstance.current &&
          terminalRef.current
        ) {
          try {
            // Check that terminal element has dimensions before fitting
            const termElement = terminalRef.current;
            if (
              termElement &&
              termElement.offsetWidth > 0 &&
              termElement.offsetHeight > 0
            ) {
              fitAddonRef.current.fit();
            } else {
              console.warn(
                "Terminal container has no dimensions yet, delaying fit"
              );
              // Try again after another delay if dimensions aren't available
              setTimeout(() => {
                try {
                  if (
                    fitAddonRef.current &&
                    terminalRef.current &&
                    terminalRef.current.offsetWidth > 0
                  ) {
                    fitAddonRef.current.fit();
                  }
                } catch (e) {
                  console.error("Error in delayed terminal fitting:", e);
                }
              }, 300);
            }
          } catch (e) {
            console.error("Error fitting terminal:", e);
          }
        }
      }, 100);
    }

    // Handle terminal output from server and detect errors
    if (socketRef.current) {
      socketRef.current.on("output", (data: string) => {
        if (terminalInstance.current) {
          terminalInstance.current.write(data);
          // Process error detection in an optimized way
          detectAndHandleError(data);
        }
      });
    }

    // Handle user input
    if (terminalInstance.current) {
      terminalInstance.current.onData((data: string) => {
        if (socketRef.current) {
          socketRef.current.emit("input", data);

          // Track command as user types
          if (data === "\r") {
            // Enter key pressed - save the current command as the last command and reset
            lastCommandRef.current = currentCommandRef.current;
            currentCommandRef.current = "";
          } else if (data === "\u007F") {
            // Backspace key - remove last character
            currentCommandRef.current = currentCommandRef.current.slice(0, -1);
          } else if (data === "\u0003") {
            // Ctrl+C - clear current command
            currentCommandRef.current = "";
          } else if (!data.startsWith("\u001b")) {
            // Ignore escape sequences and other control characters
            // Only track printable characters
            currentCommandRef.current += data;
          }
        }
      });
    }

    // Handle window resize
    const handleResize = () => {
      if (
        fitAddonRef.current &&
        terminalInstance.current &&
        terminalRef.current
      ) {
        try {
          // Check that the terminal element has dimensions before fitting
          if (
            terminalRef.current.offsetWidth > 0 &&
            terminalRef.current.offsetHeight > 0
          ) {
            fitAddonRef.current.fit();
            // Only emit resize after a successful fit
            const dimensions = {
              cols: terminalInstance.current.cols,
              rows: terminalInstance.current.rows,
            };
            if (socketRef.current) {
              socketRef.current.emit("resize", dimensions);
            }
          } else {
            console.warn("Terminal container has no dimensions during resize");
          }
        } catch (e) {
          console.error("Error during resize:", e);
        }
      }
    };

    window.addEventListener("resize", handleResize);

    // Delay the initial resize to ensure terminal is ready
    setTimeout(handleResize, 100);

    // Clean up
    return () => {
      window.removeEventListener("resize", handleResize);

      // Ensure we clean up in the correct sequence
      // First detach any events and processes
      processingErrorRef.current = false;

      // Then dispose of socket
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      // Finally dispose of terminal
      if (terminalInstance.current) {
        try {
          terminalInstance.current.dispose();
          terminalInstance.current = null;
        } catch (e) {
          console.error("Error disposing terminal:", e);
        }
      }

      // Clear addon references
      fitAddonRef.current = null;
    };
  }, [addErrorMessage, addSuggestions, detectAndHandleError]);

  // Expose the ability to run commands from outside the terminal component
  React.useEffect(() => {
    if (runCommand) {
      (window as any).runTerminalCommand = executeCommand;
    }
    return () => {
      delete (window as any).runTerminalCommand;
    };
  }, [runCommand, executeCommand]);

  return <div ref={terminalRef} className="terminal-container" />;
};

export default Terminal;
