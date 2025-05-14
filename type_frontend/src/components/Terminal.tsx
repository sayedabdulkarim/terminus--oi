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
  addMessage: (text: string, isError: boolean) => void;
  addSuggestions: (
    originalCommand: string,
    errorMessage: string,
    suggestions: CommandSuggestion[]
  ) => void;
  runCommand?: (command: string) => void;
}

const Terminal: React.FC<TerminalProps> = ({
  addErrorMessage,
  addMessage,
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
  const lastErrorRef = useRef<string>(""); // Track the last error we processed
  const commandHistoryRef = useRef<string[]>([]); // Track recent commands
  const processedPairsRef = useRef<Set<string>>(new Set()); // Track command+error pairs we've already processed
  const timeoutIdsRef = useRef<NodeJS.Timeout[]>([]); // Store all timeout IDs for cleanup
  const resizeObserverRef = useRef<ResizeObserver | null>(null); // Track ResizeObserver for cleanup

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
        const recoveryTimeout = setTimeout(() => {
          // Check if references are still valid
          if (socketRef.current && command) {
            try {
              socketRef.current.emit("input", command + "\r");
            } catch (innerE) {
              console.error("Retry command execution failed:", innerE);
            }
          }
        }, 100);

        // Add to timeout tracking for cleanup
        timeoutIdsRef.current.push(recoveryTimeout);
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

      console.log(
        "Checking terminal output for errors:",
        data.substring(0, 100) + "..."
      );

      const errorPatterns = [
        /command not found/i,
        /command not found:\s\w+/i, // Added pattern for "command not found: cmd" format
        /permission denied/i,
        /no such file or directory/i,
        /cannot access/i,
        /error:/i,
        /failed:/i,
        /bad option:/i, // Colon added to match "bad option: -ver" format
        /bad option\s+-ver/i, // Specific pattern for "bad option -ver"
        /bad option/i, // Add pattern without colon to catch variations
        /\/.*node:.*bad option/i, // Pattern to catch "/path/to/node: bad option"
        /unknown option/i, // Python often uses this for unknown options
        /unrecognized option/i,
        /invalid option/i,
        /not a directory/i,
        /not recognized/i,
        /invalid/i,
        /missing/i,
        /unexpected/i,
        /syntax error/i,
        /segmentation fault/i,
        /traceback/i,
        /exception/i,
        /cannot/i,
        /could not/i,
        /unrecognized command/i,
        /unknown command/i,
        /illegal option/i,
        /bad flag/i,
        /bad flag syntax/i,
        /unknown flag/i,
        /unknown option/i,
        /python:.*error/i, // Python specific error patterns
        /ModuleNotFoundError/i,
        /ImportError/i,
        /AttributeError/i,
      ];

      try {
        // Check if any error pattern matches the data
        const hasError = errorPatterns.some((pattern) => pattern.test(data));

        if (hasError) {
          // Set processing flag to prevent re-entrancy
          processingErrorRef.current = true;
          console.log("Error detected in terminal output!");

          // Split by both \n and \r\n to handle different line endings
          const lines = data.split(/\r?\n/).filter((line) => line.trim());

          // Find the specific line containing the error
          const errorMessage = lines.find((line) =>
            errorPatterns.some((pattern) => pattern.test(line))
          );

          if (errorMessage) {
            // Check if this is the same error we just processed
            if (lastErrorRef.current === errorMessage) {
              console.log("Skipping duplicate error:", errorMessage);
              processingErrorRef.current = false;
              return;
            }

            // Update our tracking of the last error we processed
            lastErrorRef.current = errorMessage;

            console.log("Error message identified:", errorMessage);
            console.log("Last command was:", lastCommandRef.current);

            // Specific error type detection logging
            if (
              errorMessage === "unknown option --v" ||
              errorMessage.includes("unknown option --v")
            ) {
              console.log(
                "🐍 Python version flag error detected specifically:",
                errorMessage
              );
            }

            // Special handling for various error types

            // 0. Command not found errors - always use the exact command that caused the error
            if (errorMessage.includes("command not found")) {
              // First try the more specific shell error format (zsh: command not found: mk)
              const shellErrorMatch = errorMessage.match(
                /\w+:\s+command not found:\s+(\w+)/i
              );
              let commandName: string | undefined;

              if (shellErrorMatch && shellErrorMatch[1]) {
                // This matches patterns like "zsh: command not found: mk"
                commandName = shellErrorMatch[1].trim();
                console.log("📍 Shell command not found:", commandName);
              } else {
                // Fall back to the original pattern for errors like "command: command not found"
                const commandMatch = errorMessage.match(
                  /([^\s:]+):\s+command not found/
                );
                if (commandMatch && commandMatch[1]) {
                  commandName = commandMatch[1].trim();
                  console.log("📍 Basic command not found for:", commandName);
                }
              }

              if (commandName) {
                // Check command history to see if this command was recently used
                const recentCommand = commandHistoryRef.current.find(
                  (cmd) =>
                    cmd === commandName || cmd.startsWith(commandName + " ")
                );

                if (recentCommand) {
                  console.log(
                    "Found matching command in history:",
                    recentCommand
                  );
                  lastCommandRef.current = recentCommand;
                }
                // If the last command doesn't match what the error says, update it
                else if (
                  !lastCommandRef.current.startsWith(commandName + " ") &&
                  lastCommandRef.current !== commandName
                ) {
                  console.log(
                    "Updating lastCommandRef to match the failed command:",
                    commandName
                  );
                  lastCommandRef.current = commandName;
                }

                // For command not found errors, we want to ensure we get fresh suggestions
                // each time, so completely reset all processed pairs
                console.log(
                  "Command not found - completely resetting processed pairs"
                );
                processedPairsRef.current = new Set();
              }
            }

            // 1. Node version errors
            const isNodeVersionError =
              (errorMessage.includes("bad option") &&
                errorMessage.includes("-ver")) ||
              errorMessage.match(/\/.*node:.*bad option/i) !== null;

            if (
              isNodeVersionError &&
              !lastCommandRef.current.includes("node")
            ) {
              console.log(
                "🔄 Detected node version error but command doesn't match. Setting command to 'node -ver'"
              );
              lastCommandRef.current = "node -ver";
            }

            // 2. Python errors
            const isPythonError =
              (errorMessage.includes("python") ||
                errorMessage === "unknown option --v") &&
              (errorMessage.includes("unknown option") ||
                errorMessage.includes("invalid option"));

            if (isPythonError && !lastCommandRef.current.includes("python")) {
              console.log(
                "🔄 Detected Python error but command doesn't match. Setting command appropriately"
              );
              // Check if it's likely a version check error
              if (
                errorMessage.includes("--v") ||
                errorMessage.includes("-ver") ||
                errorMessage === "unknown option --v"
              ) {
                lastCommandRef.current = "python --v";
              }
            }

            // Debug log for specific error patterns
            if (
              lastCommandRef.current.includes("node") &&
              (errorMessage.includes("bad option") ||
                errorMessage.includes("-ver"))
            ) {
              console.log("🚨 Detected node command with bad option error!");
            }

            if (
              lastCommandRef.current.includes("python") &&
              (errorMessage.includes("unknown option") ||
                errorMessage.includes("invalid option"))
            ) {
              console.log("🚨 Detected Python command with option error!");
            }

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
                  // Check if we've already processed this exact command+error pair
                  // Add timestamp to avoid permanent caching (reset after 30 seconds)
                  const currentTime = Math.floor(Date.now() / 1000);
                  const commandErrorPair = `${
                    lastCommandRef.current
                  }|||${errorMessage.trim()}|||${Math.floor(currentTime / 30)}`;

                  if (processedPairsRef.current.has(commandErrorPair)) {
                    console.log(
                      "🔄 Skipping duplicate command+error pair:",
                      commandErrorPair
                    );
                    processingErrorRef.current = false;
                    return;
                  }

                  // Track that we're processing this command+error pair
                  processedPairsRef.current.add(commandErrorPair);

                  // Save the current command for history
                  if (
                    lastCommandRef.current &&
                    !commandHistoryRef.current.includes(lastCommandRef.current)
                  ) {
                    commandHistoryRef.current.push(lastCommandRef.current);
                    // Keep only the last 10 commands
                    if (commandHistoryRef.current.length > 10) {
                      commandHistoryRef.current.shift();
                    }
                  }

                  console.log(
                    "Requesting command suggestions for:",
                    lastCommandRef.current
                  );

                  // Add a loading message in the chat panel
                  addMessage("Getting command suggestions...", false);

                  // Get suggested fixes from the command fixer agent
                  const suggestions = await commandFixerAgent(
                    lastCommandRef.current,
                    errorMessage.trim()
                  );

                  // Extra handling for Python --v errors
                  if (
                    errorMessage.trim() === "unknown option --v" &&
                    !lastCommandRef.current.includes("python")
                  ) {
                    console.log(
                      "🐍 Forcing Python command for unknown option --v error"
                    );
                    // Force this to be a Python version check issue
                    const pythonSuggestions = await commandFixerAgent(
                      "python --v", // Force the command to be Python specific
                      errorMessage.trim()
                    );

                    if (pythonSuggestions && pythonSuggestions.length > 0) {
                      console.log("Using Python-specific suggestions instead");
                      return addSuggestions(
                        "python --v",
                        errorMessage.trim(),
                        pythonSuggestions
                      );
                    }
                  }

                  console.log({
                    lastCommandRef: lastCommandRef.current,
                    errorMessage: errorMessage.trim(),
                    suggestionsReceived: suggestions.length,
                  });

                  if (suggestions.length > 0) {
                    console.log(
                      "Command suggestions received: ====",
                      suggestions
                    );
                  } else {
                    console.warn(
                      "⚠️ No suggestions were returned from the API"
                    );
                  }

                  // Add the suggestions to the chat panel
                  if (suggestions && suggestions.length > 0) {
                    console.log(
                      `Received ${suggestions.length} command suggestions`
                    );
                    addSuggestions(
                      lastCommandRef.current,
                      errorMessage.trim(),
                      suggestions
                    );
                  } else {
                    console.warn(
                      "No suggestions returned from commandFixerAgent"
                    );
                    // Add a fallback suggestion if none were returned
                    addSuggestions(
                      lastCommandRef.current,
                      errorMessage.trim(),
                      [
                        {
                          command: lastCommandRef.current.replace("-ver", "-v"),
                          description: "Possible correction for invalid flag",
                        },
                      ]
                    );
                  }
                } catch (err) {
                  console.error("Error getting command suggestions:", err);
                  // Even on error, try to provide some fallback suggestions
                  const fallbackSuggestions = [];

                  // Special case for common errors
                  if (lastCommandRef.current.includes("-ver")) {
                    fallbackSuggestions.push({
                      command: lastCommandRef.current.replace("-ver", "-v"),
                      description: "Use -v instead of -ver for version flag",
                    });
                  } else if (
                    lastCommandRef.current.includes("node") &&
                    errorMessage.includes("bad option")
                  ) {
                    // Handle other node-specific bad options
                    fallbackSuggestions.push({
                      command: "node -v",
                      description: "Show Node.js version",
                    });
                    fallbackSuggestions.push({
                      command: "node -h",
                      description: "Show Node.js help",
                    });
                  }

                  // Add fallback suggestions to the chat panel
                  if (fallbackSuggestions.length > 0) {
                    addSuggestions(
                      lastCommandRef.current,
                      errorMessage.trim(),
                      fallbackSuggestions
                    );
                  }
                }
              }

              // Reset the processing flag after a small delay
              const errorResetTimeout = setTimeout(() => {
                // Check if component is still mounted before updating refs
                if (processingErrorRef.current !== undefined) {
                  processingErrorRef.current = false;

                  // Also reset the current command ref to ensure we don't
                  // track commands incorrectly after errors
                  if (currentCommandRef.current === lastCommandRef.current) {
                    currentCommandRef.current = "";
                  }
                }
              }, 300);

              // Store the timeout ID for cleanup
              timeoutIdsRef.current.push(errorResetTimeout);
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
    [addErrorMessage, addMessage, addSuggestions]
  );
  useEffect(() => {
    console.log("Initializing terminal component");

    // Helper function for safer terminal fitting
    const runSafeFit = () => {
      if (
        fitAddonRef.current &&
        terminalInstance.current &&
        terminalRef.current &&
        document.body.contains(terminalRef.current)
      ) {
        try {
          // Check for valid dimensions before attempting fit
          if (
            terminalRef.current.offsetWidth > 0 &&
            terminalRef.current.offsetHeight > 0
          ) {
            console.log("Running safe fit with dimensions:", {
              width: terminalRef.current.offsetWidth,
              height: terminalRef.current.offsetHeight,
            });

            fitAddonRef.current.fit();

            // Verify dimensions exist after fit before emitting
            if (
              terminalInstance.current &&
              typeof terminalInstance.current.cols === "number" &&
              typeof terminalInstance.current.rows === "number"
            ) {
              console.log("Terminal dimensions after fit:", {
                cols: terminalInstance.current.cols,
                rows: terminalInstance.current.rows,
              });

              if (socketRef.current) {
                socketRef.current.emit("resize", {
                  cols: terminalInstance.current.cols,
                  rows: terminalInstance.current.rows,
                });
              }
            } else {
              console.warn(
                "Terminal dimensions unavailable after fit:",
                terminalInstance.current
              );
            }
          } else {
            console.warn("Terminal container has no dimensions for fit");
          }
        } catch (e) {
          console.error("Error in safe fit:", e);
        }
      } else {
        console.warn("Missing references for safe fit");
      }
    };

    // Initialize socket connection
    try {
      socketRef.current = io("http://localhost:3001");
      console.log("Socket connection initialized");
    } catch (err) {
      console.error("Error initializing socket connection:", err);
    }

    // Properly clean up any existing terminal instance
    if (terminalInstance.current) {
      try {
        console.log("Disposing previous terminal instance");
        terminalInstance.current.dispose();
        terminalInstance.current = null;
      } catch (err) {
        console.error("Error disposing previous terminal instance:", err);
      }
    }

    // Initialize terminal with robust error handling
    try {
      // Create new terminal instance
      const term = new XTerm({
        cursorBlink: true,
        theme: {
          background: "#1e1e1e",
          foreground: "#f0f0f0",
        },
        fontFamily: "monospace",
        fontSize: 14,
        scrollback: 1000,
        allowTransparency: true,
      });

      terminalInstance.current = term;
      console.log("Terminal instance created");

      // Initialize addons
      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      console.log("Terminal addons loaded");
    } catch (e) {
      console.error("Error initializing terminal:", e);
    }

    // Make sure we have a valid terminal element before opening
    if (!terminalRef.current) {
      console.error("Terminal container reference is not available");
      return;
    }

    // Open terminal
    if (terminalRef.current && terminalInstance.current) {
      try {
        terminalInstance.current.open(terminalRef.current);
        console.log("Terminal opened successfully");

        // Give the DOM time to properly update and render the terminal
        // before attempting to access dimensions or fit
        const domUpdateDelay = setTimeout(() => {
          // Double check that elements are still valid after the timeout
          if (
            !terminalRef.current ||
            !terminalInstance.current ||
            !fitAddonRef.current
          ) {
            console.warn(
              "Terminal references lost during initialization delay"
            );
            return;
          }

          // Initialize ResizeObserver for more reliable dimension tracking
          // This addresses issues with dimensions during page reloads
          try {
            // Remove any existing observer first
            if (resizeObserverRef.current) {
              resizeObserverRef.current.disconnect();
            }

            // Create new observer
            resizeObserverRef.current = new ResizeObserver(() => {
              // Only run fit if all components exist and terminal is visible
              if (
                fitAddonRef.current &&
                terminalInstance.current &&
                terminalRef.current &&
                document.body.contains(terminalRef.current) &&
                terminalRef.current.offsetWidth > 0 &&
                terminalRef.current.offsetHeight > 0
              ) {
                try {
                  // Safety check for valid cols and rows before fit
                  fitAddonRef.current.fit();

                  // Only emit resize after confirming dimensions exist
                  if (
                    terminalInstance.current.cols &&
                    terminalInstance.current.rows
                  ) {
                    if (socketRef.current) {
                      socketRef.current.emit("resize", {
                        cols: terminalInstance.current.cols,
                        rows: terminalInstance.current.rows,
                      });
                    }
                  }
                } catch (fitErr) {
                  console.error("Error in ResizeObserver fit:", fitErr);
                }
              }
            });

            // Start observing the terminal container
            resizeObserverRef.current.observe(terminalRef.current);
            console.log("ResizeObserver attached to terminal");

            // Initial fit after terminal initialization
            runSafeFit();
          } catch (resizeObserverErr) {
            console.error(
              "Error setting up ResizeObserver:",
              resizeObserverErr
            );
            // Fall back to manual fit logic if ResizeObserver fails
            runSafeFit();
          }
        }, 150); // Slightly longer delay to ensure DOM is ready

        timeoutIdsRef.current.push(domUpdateDelay);
      } catch (err) {
        console.error("Error opening terminal:", err);
      } // Ensure terminal is properly mounted and visible before fitting
      // This is now handled by ResizeObserver and runSafeFit
      // No need for the delayed manual fit attempts
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
          socketRef.current.emit("input", data); // Track command as user types - improved tracking
          if (data === "\r") {
            // Enter key pressed - save the current command as the last command and reset
            const trimmedCommand = currentCommandRef.current.trim();
            if (trimmedCommand) {
              console.log("Command executed:", trimmedCommand);

              // Reset the processed pairs set when executing a new command that doesn't match the last command
              // This ensures we generate new suggestions for the same error with different commands
              if (lastCommandRef.current !== trimmedCommand) {
                // Only reset the processed pairs related to the previous command
                const newProcessedPairs = new Set<string>();
                processedPairsRef.current.forEach((pair) => {
                  if (!pair.startsWith(lastCommandRef.current + "|||")) {
                    newProcessedPairs.add(pair);
                  }
                });
                processedPairsRef.current = newProcessedPairs;

                // When the command changes, clear the last error to ensure fresh processing
                lastErrorRef.current = "";
              }

              // Update the last command reference with the current command
              lastCommandRef.current = trimmedCommand;

              // Also track this in command history
              if (!commandHistoryRef.current.includes(trimmedCommand)) {
                commandHistoryRef.current.push(trimmedCommand);
                if (commandHistoryRef.current.length > 10) {
                  commandHistoryRef.current.shift();
                }
                console.log(
                  "Updated command history:",
                  commandHistoryRef.current
                );
              }

              // Enhanced tracking for specific commands known to cause errors
              if (
                trimmedCommand.match(/node\s+-ver\b/) ||
                trimmedCommand.match(/node\s+--ver\b/)
              ) {
                console.log(
                  "⚠️ Detected potentially problematic command pattern: node -ver or --ver"
                );
                // Pre-emptively notify the user this may cause an error
                addMessage(
                  "Note: The command you entered might be using an incorrect version flag. Watching for errors...",
                  false
                );
              }

              // Python-specific command tracking
              if (
                trimmedCommand.match(/python\s+--v\b/) ||
                trimmedCommand.match(/python3\s+--v\b/) ||
                trimmedCommand.match(/python\s+-ver\b/) ||
                trimmedCommand.match(/python3\s+-ver\b/)
              ) {
                console.log(
                  "⚠️ Detected potentially problematic Python command:",
                  trimmedCommand
                );
                // Store this explicitly as the last command to ensure it's tracked properly
                lastCommandRef.current = trimmedCommand;
                // Clear the processed pairs to ensure we get fresh suggestions
                processedPairsRef.current.clear();
                console.log(
                  "Python command stored in lastCommandRef:",
                  lastCommandRef.current
                );

                addMessage(
                  "Note: Python uses -V (capital V) or --version for checking version. Watching for errors...",
                  false
                );
              }

              // Other node commands that might cause errors
              if (
                trimmedCommand.match(/node\s+-[a-z]{3,}\b/) &&
                !trimmedCommand.includes("--")
              ) {
                console.log(
                  "⚠️ Detected potentially invalid node flag:",
                  trimmedCommand
                );
              }
            }
            currentCommandRef.current = "";
          } else if (data === "\u007F" || data === "\b") {
            // Backspace key - remove last character
            currentCommandRef.current = currentCommandRef.current.slice(0, -1);
          } else if (data === "\u0003") {
            // Ctrl+C - clear current command
            currentCommandRef.current = "";
          } else if (!data.startsWith("\u001b")) {
            // Ignore escape sequences and other control characters
            // Only track printable characters
            currentCommandRef.current += data;
            // Debug logging to see what's being captured
            console.log("Current command buffer:", currentCommandRef.current);
          }
        }
      });
    }

    // Handle window resize
    const handleResize = () => {
      // Use the safer fit method that includes all necessary checks
      runSafeFit();
    };

    window.addEventListener("resize", handleResize);

    // Delay the initial resize to ensure terminal is ready
    const initialResizeTimeout = setTimeout(handleResize, 100);
    timeoutIdsRef.current.push(initialResizeTimeout);

    // Clean up
    return () => {
      console.log("Cleaning up terminal component...");

      // First, remove event listeners
      window.removeEventListener("resize", handleResize);

      // Disconnect ResizeObserver
      if (resizeObserverRef.current) {
        try {
          resizeObserverRef.current.disconnect();
          resizeObserverRef.current = null;
          console.log("ResizeObserver disconnected");
        } catch (err) {
          console.error("Error disconnecting ResizeObserver:", err);
        }
      }

      // Clear any pending timeouts
      if (timeoutIdsRef.current.length > 0) {
        console.log(
          `Clearing ${timeoutIdsRef.current.length} pending timeouts`
        );
        timeoutIdsRef.current.forEach((id) => clearTimeout(id));
        timeoutIdsRef.current = [];
      }

      // Cleanup socket connection
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
          socketRef.current = null;
          console.log("Socket disconnected");
        } catch (socketErr) {
          console.error("Error disconnecting socket:", socketErr);
        }
      }

      // Cleanup fit addon
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.dispose();
          fitAddonRef.current = null;
          console.log("FitAddon disposed");
        } catch (fitErr) {
          console.error("Error disposing fit addon:", fitErr);
        }
      }

      // Cleanup terminal instance last
      if (terminalInstance.current) {
        try {
          terminalInstance.current.dispose();
          terminalInstance.current = null;
          console.log("Terminal instance disposed");
        } catch (termErr) {
          console.error("Error disposing terminal:", termErr);
        }
      }

      // Reset any remaining references as a safety measure
      processingErrorRef.current = false;

      console.log("Terminal cleanup complete");
    };
  }, [addErrorMessage, addSuggestions, detectAndHandleError, addMessage]);

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
