import React, { useEffect, useRef } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { Socket, io } from "socket.io-client";
import "xterm/css/xterm.css";
import "./Terminal.css";

const Terminal: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<XTerm | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

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
      // Delay the initial fit to ensure the terminal is fully rendered
      setTimeout(() => {
        if (fitAddonRef.current) {
          try {
            fitAddonRef.current.fit();
          } catch (e) {
            console.error("Error fitting terminal:", e);
          }
        }
      }, 100);
    }

    // Handle terminal output from server
    if (socketRef.current) {
      socketRef.current.on("output", (data: string) => {
        if (terminalInstance.current) {
          terminalInstance.current.write(data);
        }
      });
    }

    // Handle user input
    if (terminalInstance.current) {
      terminalInstance.current.onData((data: string) => {
        if (socketRef.current) {
          socketRef.current.emit("input", data);
        }
      });
    }

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current && terminalInstance.current) {
        try {
          fitAddonRef.current.fit();
          // Only emit resize after a successful fit
          const dimensions = {
            cols: terminalInstance.current.cols,
            rows: terminalInstance.current.rows,
          };
          if (socketRef.current) {
            socketRef.current.emit("resize", dimensions);
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
      if (terminalInstance.current) {
        terminalInstance.current.dispose();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return <div ref={terminalRef} className="terminal-container" />;
};

export default Terminal;
